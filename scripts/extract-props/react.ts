import { Node, Project, SourceFile, SyntaxKind } from 'ts-morph';
import { resolveHeritage, walkInterfaceMembers, walkTypeNode } from './shared';
import type { PropDoc } from './types';

// Finds the component function's `{ x = default, ... }: <typeName>` parameter
// and reads each destructured default — the spec's other source of `default`
// (alongside `@default` JSDoc), and React's only way to express one (no
// `withDefaults`-style wrapper, unlike Vue). Matches on the parameter's own
// type annotation text rather than assuming a single function per file,
// since a components file (e.g. overlay.tsx) declares several.
function destructuringDefaults(file: SourceFile, typeName: string): Map<string, string> {
  const defaults = new Map<string, string>();
  for (const param of file.getDescendantsOfKind(SyntaxKind.Parameter)) {
    if (param.getTypeNode()?.getText() !== typeName) continue;
    const pattern = param.getNameNode();
    if (!Node.isObjectBindingPattern(pattern)) continue;
    for (const el of pattern.getElements()) {
      const initializer = el.getInitializer();
      if (initializer) defaults.set(el.getName(), initializer.getText());
    }
  }
  return defaults;
}

export function extractReactPropsFromProject(
  project: Project,
  file: string,
  typeName: string,
): { members: PropDoc[]; note?: string } {
  const source = project.getSourceFileOrThrow(file);
  const iface = source.getInterface(typeName);
  if (iface) {
    const own = walkInterfaceMembers(iface);
    const notes: string[] = [];
    const inherited: PropDoc[] = [];
    for (const heritage of iface.getExtends()) {
      const { members, note } = resolveHeritage(heritage);
      inherited.push(...members);
      if (note) notes.push(note);
    }
    const defaults = destructuringDefaults(source, typeName);
    const members = [...inherited, ...own].map((m) => (m.default === undefined && defaults.has(m.name) ? { ...m, default: defaults.get(m.name)! } : m));
    return { members, note: notes[0] };
  }

  // Not an interface — try a type alias next (e.g. `export type ToggleGroupProps
  // = ToggleGroupBase & (...)`, where ToggleGroupBase itself embeds
  // `Omit<ComponentProps<'div'>, ...>`). walkTypeNode walks the alias's own
  // AST rather than its resolved Type, so the internal/external rule applies
  // inside the intersection too, not just at a top-level `extends` — walking
  // the resolved Type directly (the first version of this fix) leaked every
  // native <div> attribute TypeScript's Omit<T,K> didn't happen to name.
  const alias = source.getTypeAlias(typeName);
  if (alias) {
    return { members: walkTypeNode(alias.getTypeNodeOrThrow()) };
  }

  throw new Error(`React adapter: interface "${typeName}" not found in ${file}`);
}

// Cached across calls within one orchestrator run: a tsConfigFilePath-backed
// Project does a full program load (parses the whole repo + its type graph)
// — rebuilding one per component (~30 at the eventual full backfill, times
// 4 frameworks) is needless repeated work when every pilot component lives
// in the same repo and can share one already-loaded project.
let cachedProject: Project | undefined;

export function extractReactProps(file: string, typeName: string): { members: PropDoc[]; note?: string } {
  cachedProject ??= new Project({ tsConfigFilePath: `${process.cwd()}/../manthan-react/tsconfig.json` });
  return extractReactPropsFromProject(cachedProject, file, typeName);
}
