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

function bindableMembers(script: string): PropDoc[] {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile('bindable.ts', script);
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

export function propsFromSvelteScript(script: string, propsType: string): { members: PropDoc[]; note?: string } {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile('inline.ts', script);
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
  const bindable = bindableMembers(script);
  const declaredTypes = new Map(own.map((p) => [p.name, p.type]));
  const merged = bindable.map((b) => (declaredTypes.has(b.name) ? { ...b, type: declaredTypes.get(b.name)! } : b));
  const bindableNames = new Set(bindable.map((b) => b.name));
  return { members: [...inherited, ...own.filter((p) => !bindableNames.has(p.name)), ...merged], note: notes[0] };
}

export function extractSvelteProps(file: string, propsType: string): { members: PropDoc[]; note?: string } {
  const sfc = readFileSync(file, 'utf-8');
  return propsFromSvelteScript(extractScriptBlock(sfc), propsType);
}
