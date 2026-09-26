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
    ).rejects.toThrow(/button.*react.*boom/s);
  });

  it('throws (spec: "never silently emits an empty table") when an adapter resolves but returns zero props — a registry entry pointing at a real file/type with no matching props, not just a missing one', async () => {
    const registry: Record<string, ComponentSource> = { button: { react: { file: 'a.tsx', propsType: 'ButtonProps' } } };
    await expect(
      runExtraction(registry, { react: () => ({ members: [] }) } as any, () => {}),
    ).rejects.toThrow(/button.*react.*zero props/is);
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

  it('extracts a family page: an array-valued framework entry produces a NamedPropSection[] keyed by component name', async () => {
    const registry: Record<string, ComponentSource> = {
      tabs: {
        react: [
          { file: 'tabs.tsx', propsType: 'TabsProps' },
          { file: 'tabs.tsx', propsType: 'TabsTriggerProps' },
        ],
      },
    };
    const calls: string[] = [];
    const writes: Record<string, unknown> = {};
    await runExtraction(
      registry,
      {
        react: (file: string, typeName: string) => {
          calls.push(typeName);
          return { members: [{ name: typeName, type: 'string', required: false }] };
        },
      } as any,
      (slug, doc) => {
        writes[slug] = doc;
      },
    );
    expect(calls).toEqual(['TabsProps', 'TabsTriggerProps']);
    expect(writes.tabs).toEqual({
      slug: 'tabs',
      react: [
        { component: 'TabsProps', members: [{ name: 'TabsProps', type: 'string', required: false }] },
        { component: 'TabsTriggerProps', members: [{ name: 'TabsTriggerProps', type: 'string', required: false }] },
      ],
    });
  });

  it('a family page still fails the whole build if any one of its components errors (Review Focus: no silent partial page)', async () => {
    const registry: Record<string, ComponentSource> = {
      tabs: {
        react: [
          { file: 'tabs.tsx', propsType: 'TabsProps' },
          { file: 'tabs.tsx', propsType: 'Missing' },
        ],
      },
    };
    await expect(
      runExtraction(
        registry,
        {
          react: (_file: string, typeName: string) => {
            if (typeName === 'Missing') throw new Error('boom');
            return { members: [{ name: 'x', type: 'string', required: false }] };
          },
        } as any,
        () => {},
      ),
    ).rejects.toThrow(/tabs.*react.*boom/is);
  });

  it('a family page still fails the whole build if any one of its components resolves to zero props', async () => {
    const registry: Record<string, ComponentSource> = {
      tabs: {
        react: [
          { file: 'tabs.tsx', propsType: 'TabsProps' },
          { file: 'tabs.tsx', propsType: 'TabsTriggerProps' },
        ],
      },
    };
    await expect(
      runExtraction(registry, { react: () => ({ members: [] }) } as any, () => {}),
    ).rejects.toThrow(/tabs.*react.*zero props/is);
  });

  it('a single-component page (the pilot shape) still produces a plain PropDoc[], unchanged', async () => {
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

  it('derives a family section\'s component label from the file basename when propsType/className is absent (real case: Wave D\'s Vue radio entries omit propsType, matching the pilot\'s own "only needed to disambiguate" convention)', async () => {
    const registry: Record<string, ComponentSource> = {
      radio: { vue: [{ file: '../manthan-vue/src/components/RadioGroup.vue' }, { file: '../manthan-vue/src/components/Radio.vue' }] },
    };
    const writes: Record<string, unknown> = {};
    await runExtraction(
      registry,
      { vue: (_file: string) => ({ members: [{ name: 'x', type: 'string', required: false }] }) } as any,
      (slug, doc) => {
        writes[slug] = doc;
      },
    );
    expect((writes.radio as any).vue.map((s: any) => s.component)).toEqual(['RadioGroup', 'Radio']);
  });
});
