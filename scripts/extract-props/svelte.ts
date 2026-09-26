import { readFileSync } from 'node:fs';
import { Project, Node, SyntaxKind } from 'ts-morph';
import { resolveHeritage, walkInterfaceMembers } from './shared';
import type { PropDoc } from './types';

export function extractScriptBlock(sfc: string): string {
  const match = sfc.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Svelte adapter: no <script> block found');
  return match[1];
}

function literalTypeOf(node: Node): string {
  if (Node.isStringLiteral(node)) return 'string';
  if (Node.isNumericLiteral(node)) return 'number';
  if (Node.isTrueLiteral(node) || Node.isFalseLiteral(node)) return 'boolean';
  return 'unknown';
}

function bindableMembers(script: string, project: Project, virtualPath: string): PropDoc[] {
  const file = project.createSourceFile(`${virtualPath}.bindable.ts`, script, { overwrite: true });
  const props: PropDoc[] = [];
  // Svelte 5's $props() destructuring always assigns $bindable() as a
  // BindingElement default (`let { value = $bindable('') } = $props()`),
  // never as a standalone `let x = $bindable()` — verified against every
  // real usage in the codebase (Button, Input, Dialog, Chart).
  for (const el of file.getDescendantsOfKind(SyntaxKind.BindingElement)) {
    const initializer = el.getInitializer();
    if (!initializer || !Node.isCallExpression(initializer) || initializer.getExpression().getText() !== '$bindable') continue;
    const nameNode = el.getNameNode();
    if (!Node.isIdentifier(nameNode)) continue;
    const [defaultArg] = initializer.getArguments();
    props.push({
      name: nameNode.getText(),
      type: defaultArg ? literalTypeOf(defaultArg) : 'unknown',
      required: false,
      description: 'Two-way bindable.',
      ...(defaultArg ? { default: defaultArg.getText() } : {}),
    });
  }
  return props;
}

export function propsFromSvelteScript(
  script: string,
  propsType: string,
  project: Project = new Project({ useInMemoryFileSystem: true }),
  virtualPath = 'inline',
): { members: PropDoc[]; note?: string } {
  const file = project.createSourceFile(`${virtualPath}.ts`, script, { overwrite: true });
  const iface = file.getInterface(propsType);
  if (!iface) throw new Error(`Svelte adapter: interface "${propsType}" not found`);
  const own = walkInterfaceMembers(iface);
  const notes: string[] = [];
  const inherited: PropDoc[] = [];
  for (const heritage of iface.getExtends()) {
    const { members, note } = resolveHeritage(heritage);
    inherited.push(...members);
    if (note) notes.push(note);
  }
  const bindable = bindableMembers(script, project, virtualPath);
  const declaredTypes = new Map(own.map((p) => [p.name, p.type]));
  const merged = bindable.map((b) => (declaredTypes.has(b.name) ? { ...b, type: declaredTypes.get(b.name)! } : b));
  const bindableNames = new Set(bindable.map((b) => b.name));
  return { members: [...inherited, ...own.filter((p) => !bindableNames.has(p.name)), ...merged], note: notes[0] };
}

// Real extraction uses a tsConfigFilePath-backed project (not a bare
// useInMemoryFileSystem one) so the extracted script's imports from real
// npm packages (e.g. `@manthan/base/dom`) actually resolve — verified via
// Chart.svelte, whose `extends Omit<ChartControllerOptions<T>, 'hidden'>`
// silently resolved to nothing in an isolated in-memory project (no
// node_modules to resolve `@manthan/base` against), losing every inherited
// prop. The virtual source file is added at a path inside the real repo
// root so module resolution behaves as if it were really there, without
// ever being written to disk.
export function extractSvelteProps(file: string, propsType: string): { members: PropDoc[]; note?: string } {
  const sfc = readFileSync(file, 'utf-8');
  const repoRoot = `${process.cwd()}/../manthan-svelte`;
  const project = new Project({ tsConfigFilePath: `${repoRoot}/tsconfig.json` });
  return propsFromSvelteScript(extractScriptBlock(sfc), propsType, project, `${repoRoot}/src/lib/components/__extracted__`);
}
