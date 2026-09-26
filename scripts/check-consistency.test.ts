import { describe, expect, it } from 'vitest';
import { componentRegistry } from '../src/data/component-registry';
import { checkConsistency, demoRegistryKeys } from './check-consistency';

// A demo-key lookup that always "passes" (every registry slug has a demo in
// every framework) — isolates a test to just the behavior it's checking.
const allDemosPresent = () => new Set(Object.keys(componentRegistry));

describe('checkConsistency', () => {
  it('flags an mdx file with no registry entry, and a registry entry with no mdx file', () => {
    const problems = checkConsistency('src/content/components', () => ['button.mdx', 'orphan.mdx'], allDemosPresent);
    expect(problems).toContain('orphan.mdx has no component-registry entry');
    expect(problems.some((p) => p.includes('data-table') && p.includes('no data-table.mdx'))).toBe(true);
  });

  it('flags a registry entry whose framework has no matching demo — a slug present in the demo registries stays silent', () => {
    const mdxSlugs = Object.keys(componentRegistry).map((s) => `${s}.mdx`);
    const problems = checkConsistency(
      'src/content/components',
      () => mdxSlugs,
      (fw) => (fw === 'react' ? new Set(['button']) : allDemosPresent()),
    );
    expect(problems).toEqual(
      Object.keys(componentRegistry)
        .filter((slug) => slug !== 'button' && componentRegistry[slug].react)
        .map((slug) => expect.stringContaining(`"${slug}" (react)`)),
    );
  });
});

describe('demoRegistryKeys', () => {
  it('reads string and identifier keys from a `demos` object literal, including an `as const` wrapper', () => {
    const keys = demoRegistryKeys(`export const demos = { button: 1, 'data-table': 2, input } as const;`);
    expect(keys).toEqual(['button', 'data-table', 'input']);
  });

  it('reads a typed (non-const-asserted) `demos` object literal, e.g. Record<string, () => ReactElement>', () => {
    const keys = demoRegistryKeys(`export const demos: Record<string, () => number> = { button: () => 1, dialog: () => 2 };`);
    expect(keys).toEqual(['button', 'dialog']);
  });

  it('throws with a clear message when no `demos` declaration exists', () => {
    expect(() => demoRegistryKeys(`export const somethingElse = {};`)).toThrow(/demos/);
  });
});
