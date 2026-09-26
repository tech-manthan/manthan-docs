import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractAngularProps } from './angular';
import { extractReactProps } from './react';
import { extractSvelteProps } from './svelte';
import { extractVueProps } from './vue';
import type { ComponentPropsDoc } from './types';
import { componentRegistry, type ComponentSource } from '../../src/data/component-registry';

type Adapters = {
  react: (file: string, typeName: string) => { members: unknown[]; note?: string };
  vue: (file: string, propsType?: string) => { members: unknown[]; note?: string };
  svelte: (file: string, propsType: string) => { members: unknown[]; note?: string };
  angular: (file: string, className: string) => { members: unknown[]; note?: string };
};

export async function runExtraction(
  registry: Record<string, ComponentSource>,
  adapters: Adapters,
  write: (slug: string, doc: ComponentPropsDoc) => void,
): Promise<void> {
  for (const [slug, source] of Object.entries(registry)) {
    const doc: ComponentPropsDoc = { slug };
    // Each adapter call is caught (and its result checked) individually —
    // the spec requires the slug AND framework in the error message, and
    // requires failing loudly rather than "never silently emit[ting] an
    // empty table": an adapter that resolves without throwing but finds
    // zero props (a registry entry pointing at a real file/type that just
    // has no matching props — e.g. a typo'd propsType that happens to
    // resolve, or a component whose script has neither defineProps nor
    // defineModel) is exactly the silent-thin-table failure mode named as
    // this plan's top risk.
    const run = (framework: string, fn: () => { members: unknown[]; note?: string }): { members: unknown[]; note?: string } => {
      let result: { members: unknown[]; note?: string };
      try {
        result = fn();
      } catch (err) {
        throw new Error(`Extraction failed for "${slug}" (${framework}): ${(err as Error).message}`, { cause: err });
      }
      if (result.members.length === 0) {
        throw new Error(`Extraction failed for "${slug}" (${framework}): adapter returned zero props — check the registry's file/type name`);
      }
      return result;
    };
    if (source.react) {
      const r = run('react', () => adapters.react(source.react!.file, source.react!.propsType));
      doc.react = r.members as ComponentPropsDoc['react'];
      if (r.note) doc.reactNote = r.note;
    }
    if (source.vue) {
      const r = run('vue', () => adapters.vue(source.vue!.file, source.vue!.propsType));
      doc.vue = r.members as ComponentPropsDoc['vue'];
      if (r.note) doc.vueNote = r.note;
    }
    if (source.svelte) {
      const r = run('svelte', () => adapters.svelte(source.svelte!.file, source.svelte!.propsType));
      doc.svelte = r.members as ComponentPropsDoc['svelte'];
      if (r.note) doc.svelteNote = r.note;
    }
    if (source.angular) {
      const r = run('angular', () => adapters.angular(source.angular!.file, source.angular!.className));
      doc.angular = r.members as ComponentPropsDoc['angular'];
      if (r.note) doc.angularNote = r.note;
    }
    write(slug, doc);
  }
}

async function main() {
  mkdirSync('src/data/props', { recursive: true });
  await runExtraction(
    componentRegistry,
    { react: extractReactProps, vue: extractVueProps, svelte: extractSvelteProps, angular: extractAngularProps },
    (slug, doc) => {
      writeFileSync(`src/data/props/${slug}.json`, JSON.stringify(doc, null, 2) + '\n');
    },
  );
  console.log(`Extracted props for ${Object.keys(componentRegistry).length} component(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
