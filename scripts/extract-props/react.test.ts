import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { extractReactPropsFromProject } from './react';

describe('extractReactPropsFromProject', () => {
  it('extracts own members and notes a foreign extends', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/repo/manthan-react/src/components/button.tsx',
      `interface Foreign { onClick?: () => void; }
       export interface ButtonProps extends Foreign {
         /** Shows a spinner. */
         loading?: boolean;
       }`,
    );
    const result = extractReactPropsFromProject(project, '/repo/manthan-react/src/components/button.tsx', 'ButtonProps');
    expect(result.members).toEqual([{ name: 'loading', type: 'boolean', required: false, description: 'Shows a spinner.' }]);
    expect(result.note).toContain('Foreign');
  });

  it('throws when the named interface is missing', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/repo/a.tsx', `export interface Other {}`);
    expect(() => extractReactPropsFromProject(project, '/repo/a.tsx', 'ButtonProps')).toThrow(/ButtonProps/);
  });
});
