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
