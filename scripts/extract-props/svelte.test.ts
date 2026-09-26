import { describe, expect, it } from 'vitest';
import { extractScriptBlock, propsFromSvelteScript } from './svelte';

describe('extractScriptBlock', () => {
  it('pulls the <script lang="ts" ...> block regardless of extra attributes', () => {
    const sfc = `<script lang="ts" generics="T">\nlet x = 1;\n</script>`;
    expect(extractScriptBlock(sfc)).toContain('let x = 1;');
  });
});

describe('propsFromSvelteScript', () => {
  it('extracts a named Props interface, noting a foreign extends and picking up $bindable defaults', () => {
    // propsFromSvelteScript analyzes the extracted <script> block in its own
    // isolated in-memory project (just this one file, no real node_modules),
    // so an import from a real package specifier can never resolve there —
    // which is exactly the "external, don't enumerate" case for this test.
    const script = `
      import type { Foreign } from 'svelte/elements';
      interface Props extends Foreign {
        /** Shows a spinner. */
        loading?: boolean;
      }
      let { loading, value = $bindable('') }: Props = $props();
    `;
    const { members, note } = propsFromSvelteScript(script, 'Props');
    expect(members).toContainEqual({ name: 'loading', type: 'boolean', required: false, description: 'Shows a spinner.' });
    expect(members).toContainEqual({ name: 'value', type: 'string', required: false, default: "''", description: 'Two-way bindable.' });
    expect(note).toContain('Foreign');
  });

  it('prints an unbound generic prop type as plain text instead of erroring (DataTable/Chart use <T>)', () => {
    const script = `
      interface Props { columns: ColumnDef<T>[]; rows: T[]; }
      let { columns, rows }: Props = $props();
    `;
    const { members } = propsFromSvelteScript(script, 'Props');
    expect(members).toEqual([
      { name: 'columns', type: 'ColumnDef<T>[]', required: true },
      { name: 'rows', type: 'T[]', required: true },
    ]);
  });
});
