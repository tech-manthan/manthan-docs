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
  it('treats any of our own source as internal, and anything under node_modules as external', () => {
    expect(isInternalDeclaration('/repo/manthan-base/src/dom/chart.ts')).toBe(true);
    expect(isInternalDeclaration('/repo/manthan-react/src/components/button.tsx')).toBe(true);
    expect(isInternalDeclaration('/repo/node_modules/react/index.d.ts')).toBe(false);
  });

  it('still treats a published @manthan/* package as internal even once it resolves under node_modules (roadmap item 2)', () => {
    // Today, `file:../manthan-base` devDependencies resolve to a realpath
    // outside node_modules, so plain `!includes('node_modules')` happens to
    // work — but once real npm-published @manthan/* versions replace those
    // links, their declarations resolve to genuine node_modules/@manthan/*
    // paths, and that same check would silently start treating every
    // Manthan-authored heritage type as external (a note, not real props) —
    // exactly Chart's Review Focus risk, just triggered by publishing
    // instead of a broken import.
    expect(isInternalDeclaration('/repo/node_modules/@manthan/base/dist/dom/chart.d.ts')).toBe(true);
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

  it('notes an extends reference to an external (node_modules) type instead of enumerating it', () => {
    const p = project();
    p.createSourceFile('/repo/node_modules/react/index.d.ts', `export interface ComponentProps { onClick?: () => void; }`);
    const file = p.createSourceFile(
      '/repo/manthan-react/src/components/button.tsx',
      `import type { ComponentProps } from 'react';
       interface ButtonProps extends ComponentProps { loading?: boolean; }`,
    );
    const [heritage] = file.getInterfaceOrThrow('ButtonProps').getExtends();
    const { members, note } = resolveHeritage(heritage);
    expect(members).toEqual([]);
    expect(note).toContain('ComponentProps');
  });

  it('resolves an extends reference to a local type alias, not just a local interface (e.g. `type ButtonVariants = VariantProps<typeof button>`)', () => {
    const p = project();
    const file = p.createSourceFile(
      '/repo/manthan-react/src/components/button.tsx',
      `type ButtonVariants = { variant?: 'solid' | 'soft'; size?: 'sm' | 'md' };
       interface ButtonProps extends ButtonVariants { loading?: boolean; }`,
    );
    const [heritage] = file.getInterfaceOrThrow('ButtonProps').getExtends();
    const { members, note } = resolveHeritage(heritage);
    expect(note).toBeUndefined();
    expect(members).toEqual([
      { name: 'variant', type: "'solid' | 'soft'", required: false },
      { name: 'size', type: "'sm' | 'md'", required: false },
    ]);
  });

  it('resolves a heritage member type to its readable alias name, not a bundled-dts import path (regression: real Chart extraction)', () => {
    const repoRoot = `${process.cwd()}/../manthan-react`;
    const project = new Project({ tsConfigFilePath: `${repoRoot}/tsconfig.json` });
    const file = project.addSourceFileAtPath(`${repoRoot}/src/components/chart.tsx`);
    const [heritage] = file.getInterfaceOrThrow('ChartProps').getExtends();
    const { members } = resolveHeritage(heritage);
    const byName = new Map(members.map((m) => [m.name, m.type]));
    expect(byName.get('type')).toBe('ChartType');
    expect(byName.get('series')).toBe('ChartSeries[]');
    expect(byName.get('curve')).toBe('ChartCurve');
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
