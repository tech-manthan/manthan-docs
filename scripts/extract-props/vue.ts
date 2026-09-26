import { readFileSync } from 'node:fs';
import { Project, Node, SyntaxKind, SourceFile, CallExpression } from 'ts-morph';
import { resolveHeritage, walkInterfaceMembers } from './shared';
import type { PropDoc } from './types';

export function extractScriptSetup(sfc: string): string {
  const match = sfc.match(/<script[^>]*setup[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Vue adapter: no <script setup> block found');
  return match[1];
}

function findDefinePropsCall(script: string): { file: SourceFile; call: CallExpression } {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile('inline.ts', script);
  const call = file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((c) => c.getExpression().getText() === 'defineProps');
  if (!call) throw new Error('Vue adapter: no defineProps<...>() call found');
  return { file, call };
}

function definePropsMembers(file: SourceFile, call: CallExpression): PropDoc[] {
  const [typeArg] = call.getTypeArguments();
  if (Node.isTypeLiteral(typeArg)) {
    return typeArg.getMembers().map((m) => {
      if (!Node.isPropertySignature(m)) throw new Error('Vue adapter: unsupported defineProps member shape');
      return {
        name: m.getName(),
        type: (m.getTypeNode() ?? m.getType()).getText(),
        required: !m.hasQuestionToken(),
      };
    });
  }
  if (Node.isTypeReferenceNode(typeArg)) {
    const iface = file.getInterfaceOrThrow(typeArg.getTypeName().getText());
    const own = walkInterfaceMembers(iface);
    const inherited = iface.getExtends().flatMap((h) => resolveHeritage(h).members);
    return [...inherited, ...own];
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

function defineModelMembers(script: string): PropDoc[] {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile('models.ts', script);
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

export function propsFromScript(script: string): { members: PropDoc[]; note?: string } {
  let members: PropDoc[] = [];
  let note: string | undefined;
  if (script.includes('defineProps')) {
    const { file, call } = findDefinePropsCall(script);
    members = applyWithDefaults(file, call, definePropsMembers(file, call));
  }
  members = [...members, ...defineModelMembers(script)];
  return { members, note };
}

export function extractVueProps(file: string): { members: PropDoc[]; note?: string } {
  const sfc = readFileSync(file, 'utf-8');
  return propsFromScript(extractScriptSetup(sfc));
}
