import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { isInternalDeclaration, resolveHeritage, walkInterfaceMembers } from './shared';

function project() {
  return new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
}

describe('walkInterfaceMembers', () => {
  it('extracts a required prop, an optional prop, and a JSDoc description', () => {
    const p = project();
    const file = p.createSourceFile(
      'a.ts',
      `interface Props {
        /** Shows a spinner. */
        loading?: boolean;
        label: string;
      }`,
    );
    const props = walkInterfaceMembers(file.getInterfaceOrThrow('Props'));
    expect(props).toEqual([
      { name: 'loading', type: 'boolean', required: false, description: 'Shows a spinner.' },
      { name: 'label', type: 'string', required: true },
    ]);
  });
});

describe('isInternalDeclaration', () => {
  it('treats manthan-base paths as internal and everything else as external', () => {
    expect(isInternalDeclaration('/repo/manthan-base/src/dom/chart.ts')).toBe(true);
    expect(isInternalDeclaration('/repo/node_modules/react/index.d.ts')).toBe(false);
  });
});

describe('resolveHeritage', () => {
  it('resolves an extends reference to an internal manthan-base interface', () => {
    const p = project();
    p.createSourceFile(
      '/repo/manthan-base/src/dom/chart.ts',
      `export interface ChartControllerOptions { type: string; height?: number; }`,
    );
    const file = p.createSourceFile(
      '/repo/manthan-react/src/components/chart.tsx',
      `import type { ChartControllerOptions } from '../../../manthan-base/src/dom/chart';
       interface ChartProps extends ChartControllerOptions { className?: string; }`,
    );
    const [heritage] = file.getInterfaceOrThrow('ChartProps').getExtends();
    const { members, note } = resolveHeritage(heritage);
    expect(note).toBeUndefined();
    expect(members).toEqual([
      { name: 'type', type: 'string', required: true },
      { name: 'height', type: 'number', required: false },
    ]);
  });

  it('notes an extends reference to an external type instead of enumerating it', () => {
    const p = project();
    const file = p.createSourceFile(
      '/repo/manthan-react/src/components/button.tsx',
      `interface Native { onClick?: () => void; }
       interface ButtonProps extends Native { loading?: boolean; }`,
    );
    // "Native" here stands in for a type from outside manthan-base (e.g. React's ComponentProps);
    // resolveHeritage only special-cases the *path*, so any non-manthan-base path proves the branch.
    const [heritage] = file.getInterfaceOrThrow('ButtonProps').getExtends();
    const { members, note } = resolveHeritage(heritage);
    expect(members).toEqual([]);
    expect(note).toContain('Native');
  });

  it('unwraps Omit<Internal, "k"> and drops the omitted key', () => {
    const p = project();
    p.createSourceFile(
      '/repo/manthan-base/src/dom/chart.ts',
      `export interface ChartControllerOptions { type: string; hidden?: string[]; }`,
    );
    const file = p.createSourceFile(
      '/repo/manthan-svelte/src/lib/components/Chart.svelte.ts',
      `import type { ChartControllerOptions } from '../../../../manthan-base/src/dom/chart';
       interface Props extends Omit<ChartControllerOptions, 'hidden'> { class?: string; }`,
    );
    const [heritage] = file.getInterfaceOrThrow('Props').getExtends();
    const { members } = resolveHeritage(heritage);
    expect(members).toEqual([{ name: 'type', type: 'string', required: true }]);
  });
});
