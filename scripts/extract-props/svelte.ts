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

// Reads a plain (non-`$bindable`) destructuring default off the `$props()`
// pattern — the spec's other source of `default`, alongside `@default`
// JSDoc. Shares `bindableMembers`' BindingElement scan but skips any element
// whose initializer IS a `$bindable(...)` call, since that path already
// records its own default.
function declaredDefaults(script: string, project: Project, virtualPath: string): Map<string, string> {
  const file = project.createSourceFile(`${virtualPath}.defaults.ts`, script, { overwrite: true });
  const defaults = new Map<string, string>();
  for (const el of file.getDescendantsOfKind(SyntaxKind.BindingElement)) {
    const initializer = el.getInitializer();
    if (!initializer || (Node.isCallExpression(initializer) && initializer.getExpression().getText() === '$bindable')) continue;
    const nameNode = el.getNameNode();
    if (!Node.isIdentifier(nameNode)) continue;
    defaults.set(nameNode.getText(), initializer.getText());
  }
  return defaults;
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
  const declaredOwn = new Map(own.map((p) => [p.name, p]));
  // A bindable prop's type/required/description come from the *declared*
  // Props interface member when one exists (the real, author-written
  // JSDoc and required-ness), not from bindableMembers' own guesses —
  // bindableMembers only sees the destructuring pattern, which has no way
  // to carry a JSDoc comment or express "required" (every $bindable() looks
  // optional there, since Svelte always requires a default expression).
  const merged = bindable.map((b) => {
    const declared = declaredOwn.get(b.name);
    if (!declared) return b;
    return {
      ...b,
      type: declared.type,
      required: declared.required,
      ...(declared.description ? { description: `Two-way bindable. ${declared.description}` } : {}),
    };
  });
  const bindableNames = new Set(bindable.map((b) => b.name));
  const defaults = declaredDefaults(script, project, virtualPath);
  const ownWithDefaults = own
    .filter((p) => !bindableNames.has(p.name))
    .map((p) => (p.default === undefined && defaults.has(p.name) ? { ...p, default: defaults.get(p.name)! } : p));
  return { members: [...inherited.filter((p) => !bindableNames.has(p.name)), ...ownWithDefaults, ...merged], note: notes[0] };
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
// Cached across calls within one orchestrator run — see react.ts's identical
// comment. Safe to share here too: each call overwrites the same virtual
// path before reading it back, and calls are sequential, never concurrent.
let cachedProject: Project | undefined;

export function extractSvelteProps(file: string, propsType: string): { members: PropDoc[]; note?: string } {
  const sfc = readFileSync(file, 'utf-8');
  const repoRoot = `${process.cwd()}/../manthan-svelte`;
  cachedProject ??= new Project({ tsConfigFilePath: `${repoRoot}/tsconfig.json` });
  return propsFromSvelteScript(extractScriptBlock(sfc), propsType, cachedProject, `${repoRoot}/src/lib/components/__extracted__`);
}
