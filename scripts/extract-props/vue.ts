import { readFileSync } from 'node:fs';
import { Project, Node, SyntaxKind, SourceFile, CallExpression } from 'ts-morph';
import { jsDocOf, resolveHeritage, walkInterfaceMembers } from './shared';
import type { PropDoc } from './types';

export function extractScriptSetup(sfc: string): string {
  const match = sfc.match(/<script[^>]*setup[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Vue adapter: no <script setup> block found');
  return match[1];
}

// `Node.isTypeReferenceNode` doesn't exist as a generated guard in this
// ts-morph version (found via a real-repo regression test — it threw
// `TypeError: Node.isTypeReferenceNode is not a function` the first time
// this branch actually ran, meaning the whole named-interface defineProps
// path had never been exercised). `Node.is(SyntaxKind.TypeReference)`
// is the equivalent guard.
const isTypeReference = Node.is(SyntaxKind.TypeReference);

function findDefinePropsCall(file: SourceFile): CallExpression {
  const call = file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((c) => c.getExpression().getText() === 'defineProps');
  if (!call) throw new Error('Vue adapter: no defineProps<...>() call found');
  return call;
}

function definePropsMembers(file: SourceFile, call: CallExpression): { members: PropDoc[]; note?: string } {
  const [typeArg] = call.getTypeArguments();
  if (Node.isTypeLiteral(typeArg)) {
    return {
      members: typeArg.getMembers().map((m) => {
        if (!Node.isPropertySignature(m)) throw new Error('Vue adapter: unsupported defineProps member shape');
        const { description, default: def } = jsDocOf(m);
        return {
          name: m.getName(),
          type: (m.getTypeNode() ?? m.getType()).getText(),
          required: !m.hasQuestionToken(),
          ...(def ? { default: def } : {}),
          ...(description ? { description } : {}),
        };
      }),
    };
  }
  if (isTypeReference(typeArg)) {
    const iface = file.getInterfaceOrThrow(typeArg.getTypeName().getText());
    const own = walkInterfaceMembers(iface);
    const notes: string[] = [];
    const inherited: PropDoc[] = [];
    for (const heritage of iface.getExtends()) {
      const { members, note } = resolveHeritage(heritage);
      inherited.push(...members);
      if (note) notes.push(note);
    }
    return { members: [...inherited, ...own], note: notes[0] };
  }
  throw new Error('Vue adapter: defineProps<...> argument must be an object type or a named interface');
}

// Walks the already-parsed AST rather than re-extracting `withDefaults(...)`'s
// second argument as text via regex — a non-greedy brace-matching regex
// truncates at the first nested `}` (e.g. a default like
// `(row) => String((row as { id?: unknown }).id ?? i)`), silently corrupting
// any default whose expression itself contains an object type or literal.
function applyWithDefaults(file: SourceFile, definePropsCall: CallExpression, members: PropDoc[]): PropDoc[] {
  const withDefaultsCall = file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((c) => c.getExpression().getText() === 'withDefaults' && c.getArguments()[0] === definePropsCall);
  if (!withDefaultsCall) return members;
  const [, defaultsArg] = withDefaultsCall.getArguments();
  if (!defaultsArg || !Node.isObjectLiteralExpression(defaultsArg)) return members;
  const defaults = new Map(
    defaultsArg.getProperties().map((p) => {
      if (!Node.isPropertyAssignment(p)) throw new Error('Vue adapter: unsupported withDefaults shape');
      return [p.getName(), p.getInitializer()!.getText()];
    }),
  );
  return members.map((m) => (defaults.has(m.name) ? { ...m, default: defaults.get(m.name) } : m));
}

function defineModelMembers(script: string, project: Project, virtualPath: string): PropDoc[] {
  const file = project.createSourceFile(`${virtualPath}.models.ts`, script, { overwrite: true });
  return file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((c) => c.getExpression().getText() === 'defineModel')
    .map((c) => {
      const [typeArg] = c.getTypeArguments();
      const args = c.getArguments();
      const nameArg = args.find((a) => Node.isStringLiteral(a));
      const optionsArg = args.find((a) => Node.isObjectLiteralExpression(a));
      const name = nameArg && Node.isStringLiteral(nameArg) ? nameArg.getLiteralText() : 'modelValue';
      const defaultProp =
        optionsArg && Node.isObjectLiteralExpression(optionsArg)
          ? optionsArg.getProperties().find((p) => Node.isPropertyAssignment(p) && p.getName() === 'default')
          : undefined;
      return {
        name,
        type: typeArg?.getText() ?? 'unknown',
        required: false,
        description: 'Two-way bindable.',
        ...(defaultProp && Node.isPropertyAssignment(defaultProp) ? { default: defaultProp.getInitializer()!.getText() } : {}),
      };
    });
}

// Real extraction uses a tsConfigFilePath-backed project (not a bare
// useInMemoryFileSystem one) so an internal `extends` reference resolves
// against real node_modules, matching the Svelte adapter's fix (needed
// there for Chart's `extends Omit<ChartControllerOptions<T>, 'hidden'>`;
// no current Vue component triggers this, but the next one that extends an
// internal type will, and an in-memory project would silently drop its
// inherited props instead of erroring).
export function propsFromScript(
  script: string,
  project: Project = new Project({ useInMemoryFileSystem: true }),
  virtualPath = 'inline',
): { members: PropDoc[]; note?: string } {
  let members: PropDoc[] = [];
  let note: string | undefined;
  if (script.includes('defineProps')) {
    const file = project.createSourceFile(`${virtualPath}.ts`, script, { overwrite: true });
    const call = findDefinePropsCall(file);
    const result = definePropsMembers(file, call);
    members = applyWithDefaults(file, call, result.members);
    note = result.note;
  }
  members = [...members, ...defineModelMembers(script, project, virtualPath)];
  return { members, note };
}

// Cached across calls within one orchestrator run — see react.ts's identical
// comment. Safe to share here too: each call overwrites the same virtual
// path before reading it back, and calls are sequential, never concurrent.
let cachedProject: Project | undefined;

export function extractVueProps(file: string): { members: PropDoc[]; note?: string } {
  const sfc = readFileSync(file, 'utf-8');
  const repoRoot = `${process.cwd()}/../manthan-vue`;
  cachedProject ??= new Project({ tsConfigFilePath: `${repoRoot}/tsconfig.json` });
  return propsFromScript(extractScriptSetup(sfc), cachedProject, `${repoRoot}/src/components/__extracted__`);
}
