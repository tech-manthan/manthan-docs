import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { extractReactPropsFromProject } from './react';

describe('extractReactPropsFromProject', () => {
  it('extracts own members and notes a foreign extends', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/repo/node_modules/react/index.d.ts', `export interface Foreign { onClick?: () => void; }`);
    project.createSourceFile(
      '/repo/manthan-react/src/components/button.tsx',
      `import type { Foreign } from 'react';
       export interface ButtonProps extends Foreign {
         /** Shows a spinner. */
         loading?: boolean;
       }`,
    );
    const result = extractReactPropsFromProject(project, '/repo/manthan-react/src/components/button.tsx', 'ButtonProps');
    expect(result.members).toEqual([{ name: 'loading', type: 'boolean', required: false, description: 'Shows a spinner.' }]);
    expect(result.note).toContain('Foreign');
  });

  it('reads a destructuring default from the component function whose parameter is typed with propsType (spec: "default comes from a destructuring default or an @default JSDoc tag")', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/repo/manthan-react/src/components/dialog.tsx',
      `export interface DialogProps {
         closeOnEscape?: boolean;
         title: string;
       }
       export function Dialog({ closeOnEscape = true, title }: DialogProps) {
         return null;
       }`,
    );
    const result = extractReactPropsFromProject(project, '/repo/manthan-react/src/components/dialog.tsx', 'DialogProps');
    expect(result.members).toEqual([
      { name: 'closeOnEscape', type: 'boolean', required: false, default: 'true' },
      { name: 'title', type: 'string', required: true },
    ]);
  });

  it('resolves a type alias (not just an interface), including an intersection-of-union shape (regression: real ToggleGroupProps)', () => {
    const project = new Project({ tsConfigFilePath: `${process.cwd()}/../manthan-react/tsconfig.json` });
    const result = extractReactPropsFromProject(project, `${process.cwd()}/../manthan-react/src/components/advanced.tsx`, 'ToggleGroupProps');
    const byName = new Map(result.members.map((m) => [m.name, m]));
    expect(byName.get('variant')).toEqual({ name: 'variant', type: "'segmented' | 'outline' | 'ghost'", required: false });
    expect(byName.get('orientation')).toEqual({ name: 'orientation', type: "'horizontal' | 'vertical'", required: false });
    expect(byName.get('type')).toBeDefined();
    expect(byName.get('type')!.type).toContain('single');
    expect(byName.get('type')!.type).toContain('multiple');
    expect(byName.get('value')).toBeDefined();
    expect(byName.has('onClick')).toBe(false);
  });

  it('throws when the named interface is missing', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/repo/a.tsx', `export interface Other {}`);
    expect(() => extractReactPropsFromProject(project, '/repo/a.tsx', 'ButtonProps')).toThrow(/ButtonProps/);
  });
});
