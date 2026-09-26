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
    const notes: string[] = [];
    try {
      if (source.react) {
        const r = adapters.react(source.react.file, source.react.propsType);
        doc.react = r.members as ComponentPropsDoc['react'];
        if (r.note) notes.push(r.note);
      }
      if (source.vue) {
        const r = adapters.vue(source.vue.file, source.vue.propsType);
        doc.vue = r.members as ComponentPropsDoc['vue'];
        if (r.note) notes.push(r.note);
      }
      if (source.svelte) {
        const r = adapters.svelte(source.svelte.file, source.svelte.propsType);
        doc.svelte = r.members as ComponentPropsDoc['svelte'];
        if (r.note) notes.push(r.note);
      }
      if (source.angular) {
        const r = adapters.angular(source.angular.file, source.angular.className);
        doc.angular = r.members as ComponentPropsDoc['angular'];
        if (r.note) notes.push(r.note);
      }
    } catch (err) {
      throw new Error(`Extraction failed for "${slug}": ${(err as Error).message}`, { cause: err });
    }
    if (notes[0]) doc.note = notes[0];
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
