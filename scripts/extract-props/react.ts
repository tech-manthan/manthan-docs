import { Project } from 'ts-morph';
import { resolveHeritage, walkInterfaceMembers } from './shared';
import type { PropDoc } from './types';

export function extractReactPropsFromProject(
  project: Project,
  file: string,
  typeName: string,
): { members: PropDoc[]; note?: string } {
  const source = project.getSourceFileOrThrow(file);
  const iface = source.getInterface(typeName);
  if (!iface) throw new Error(`React adapter: interface "${typeName}" not found in ${file}`);
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

export function extractReactProps(file: string, typeName: string): { members: PropDoc[]; note?: string } {
  const project = new Project({ tsConfigFilePath: `${process.cwd()}/../manthan-react/tsconfig.json` });
  return extractReactPropsFromProject(project, file, typeName);
}
