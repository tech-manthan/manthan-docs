import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { extractScriptSetup, propsFromScript } from './vue';

describe('extractScriptSetup', () => {
  it('pulls the <script setup lang="ts"> block out of an SFC', () => {
    const sfc = `<script setup lang="ts">\nconst x = 1;\n</script>\n<template><div /></template>`;
    expect(extractScriptSetup(sfc)).toContain('const x = 1;');
  });
});

describe('propsFromScript', () => {
  it('reads an inline defineProps<{...}> object type, including a withDefaults default', () => {
    const script = `
      withDefaults(defineProps<{ variant?: 'solid' | 'soft'; type?: 'button' | 'submit' }>(), { type: 'button' });
    `;
    const { members } = propsFromScript(script);
    expect(members).toEqual([
      { name: 'variant', type: "'solid' | 'soft'", required: false },
      { name: 'type', type: "'button' | 'submit'", required: false, default: "'button'" },
    ]);
  });

  it('reads JSDoc description and an @default tag off an inline defineProps<{...}> object type member (Chart\'s real curve prop has no withDefaults, only an @default tag)', () => {
    const script = `
      defineProps<{
        /**
         * Line curve style.
         * @default 'monotone'
         */
        curve?: 'linear' | 'monotone' | 'step';
      }>();
    `;
    const { members } = propsFromScript(script);
    expect(members).toEqual([
      { name: 'curve', type: "'linear' | 'monotone' | 'step'", required: false, default: "'monotone'", description: 'Line curve style.' },
    ]);
  });

  it('surfaces a heritage note from a named-interface defineProps<Interface>() that extends a foreign type, instead of discarding it', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/repo/node_modules/react/index.d.ts', `export interface Foreign { onClick?: () => void; }`);
    const script = `
      import type { Foreign } from 'react';
      interface Props extends Foreign {
        loading?: boolean;
      }
      defineProps<Props>();
    `;
    const { note } = propsFromScript(script, project, '/repo/manthan-vue/src/components/__test__');
    expect(note).toContain('Foreign');
  });

  it('reads defineModel<T>() as modelValue and a named defineModel as its given name', () => {
    const script = `
      const model = defineModel<string>();
      const open = defineModel<boolean>('open', { default: false });
    `;
    const { members } = propsFromScript(script);
    expect(members).toContainEqual({ name: 'modelValue', type: 'string', required: false, description: 'Two-way bindable.' });
    expect(members).toContainEqual({
      name: 'open',
      type: 'boolean',
      required: false,
      default: 'false',
      description: 'Two-way bindable.',
    });
  });

  it('prints an unbound generic prop type as plain text instead of erroring (DataTable/Chart use <T>)', () => {
    const script = `defineProps<{ columns: ColumnDef<T>[]; rows: T[] }>();`;
    const { members } = propsFromScript(script);
    expect(members).toEqual([
      { name: 'columns', type: 'ColumnDef<T>[]', required: true },
      { name: 'rows', type: 'T[]', required: true },
    ]);
  });

  it('resolves an internal extends reference against real node_modules when given a real, tsConfigFilePath-backed project (regression: Svelte needed this for Chart, Vue should match for consistency)', () => {
    const repoRoot = `${process.cwd()}/../manthan-vue`;
    const project = new Project({ tsConfigFilePath: `${repoRoot}/tsconfig.json` });
    const virtualPath = `${repoRoot}/src/components/__extracted_test__.ts`;
    const script = `
      import type { ChartControllerOptions } from '@manthan/base/dom';
      interface Props extends Omit<ChartControllerOptions, 'hidden'> { class?: string; }
      defineProps<Props>();
    `;
    const { members } = propsFromScript(script, project, virtualPath);
    expect(members.find((m) => m.name === 'type')).toEqual({ name: 'type', type: 'ChartType', required: true });
    expect(members.find((m) => m.name === 'class')).toEqual({ name: 'class', type: 'string', required: false });
  });

  it('reads a withDefaults default whose expression itself contains braces, without truncating it (DataTable\'s real getRowId default)', () => {
    const script = `
      withDefaults(defineProps<{ getRowId?: (row: unknown, i: number) => string }>(), {
        getRowId: (row: unknown, i: number) => String((row as { id?: unknown }).id ?? i),
      });
    `;
    const { members } = propsFromScript(script);
    expect(members).toEqual([
      {
        name: 'getRowId',
        type: '(row: unknown, i: number) => string',
        required: false,
        default: '(row: unknown, i: number) => String((row as { id?: unknown }).id ?? i)',
      },
    ]);
  });
});
