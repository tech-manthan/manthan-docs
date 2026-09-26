import { describe, expect, it } from 'vitest';
import { runExtraction } from './index';
import type { ComponentSource } from '../../src/data/component-registry';

describe('runExtraction', () => {
  it('throws with the slug and framework named when an adapter throws', async () => {
    const registry: Record<string, ComponentSource> = { button: { react: { file: 'missing.tsx', propsType: 'ButtonProps' } } };
    await expect(
      runExtraction(
        registry,
        {
          react: () => {
            throw new Error('boom');
          },
        } as any,
        () => {},
      ),
    ).rejects.toThrow(/button.*boom/s);
  });

  it('writes one JSON file per slug via the provided writer', async () => {
    const registry: Record<string, ComponentSource> = { button: { react: { file: 'a.tsx', propsType: 'ButtonProps' } } };
    const writes: Record<string, unknown> = {};
    await runExtraction(
      registry,
      { react: () => ({ members: [{ name: 'loading', type: 'boolean', required: false }] }) } as any,
      (slug, doc) => {
        writes[slug] = doc;
      },
    );
    expect(writes.button).toEqual({ slug: 'button', react: [{ name: 'loading', type: 'boolean', required: false }] });
  });
});
