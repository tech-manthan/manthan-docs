import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractAngularProps } from './angular';
import { extractReactProps } from './react';
import { extractSvelteProps } from './svelte';
import { extractVueProps } from './vue';
import type { ComponentPropsDoc, NamedPropSection } from './types';
import {
  componentRegistry,
  type AngularEntry,
  type ComponentSource,
  type ReactEntry,
  type SvelteEntry,
  type VueEntry,
} from '../../src/data/component-registry';

type AdapterResult = { members: unknown[]; note?: string };
type Adapters = {
  react: (file: string, typeName: string) => AdapterResult;
  vue: (file: string, propsType?: string) => AdapterResult;
  svelte: (file: string, propsType: string) => AdapterResult;
  angular: (file: string, className: string) => AdapterResult;
};

function labelOf(e: ReactEntry | VueEntry | SvelteEntry | AngularEntry): string {
  if ('propsType' in e && e.propsType) return e.propsType;
  if ('className' in e) return e.className;
  // Vue entries may omit propsType entirely (it's only needed to
  // disambiguate multiple types in scope — most components don't need it,
  // pilot precedent). Fall back to the file's own basename, which is
  // already the component's PascalCase name by convention (RadioGroup.vue
  // → "RadioGroup") for every framework's file layout.
  return e.file.replace(/^.*\//, '').replace(/\.(vue|svelte|tsx?|ts)$/, '');
}

export async function runExtraction(
  registry: Record<string, ComponentSource>,
  adapters: Adapters,
  write: (slug: string, doc: ComponentPropsDoc) => void,
): Promise<void> {
  for (const [slug, source] of Object.entries(registry)) {
    const doc: ComponentPropsDoc = { slug };
    // Each individual (framework, component) extraction is caught and
    // zero-checked on its own — a family page's second or third component
    // failing must fail the whole build exactly like a single-component
    // page's only component failing does (Review Focus: no silent partial
    // family page). An adapter that resolves without throwing but finds
    // zero props (a registry entry pointing at a real file/type with no
    // matching props) is exactly the silent-thin-table failure mode this
    // spec names as the top risk.
    const run = (framework: string, label: string, fn: () => AdapterResult): AdapterResult => {
      let result: AdapterResult;
      try {
        result = fn();
      } catch (err) {
        throw new Error(`Extraction failed for "${slug}" (${framework}${label ? `/${label}` : ''}): ${(err as Error).message}`, { cause: err });
      }
      if (result.members.length === 0) {
        throw new Error(`Extraction failed for "${slug}" (${framework}${label ? `/${label}` : ''}): adapter returned zero props — check the registry's file/type name`);
      }
      return result;
    };

    function handle<E extends ReactEntry | VueEntry | SvelteEntry | AngularEntry>(
      framework: 'react' | 'vue' | 'svelte' | 'angular',
      entry: E | E[] | undefined,
      call: (e: E) => AdapterResult,
    ): void {
      if (!entry) return;
      if (Array.isArray(entry)) {
        const sections: NamedPropSection[] = [];
        const notes: string[] = [];
        for (const e of entry) {
          const label = labelOf(e);
          const r = run(framework, label, () => call(e));
          sections.push({ component: label, members: r.members as PropDocArray, ...(r.note ? { note: r.note } : {}) });
          if (r.note) notes.push(r.note);
        }
        (doc as unknown as Record<string, unknown>)[framework] = sections;
        if (notes[0]) (doc as unknown as Record<string, string>)[`${framework}Note`] = notes[0];
      } else {
        const r = run(framework, '', () => call(entry));
        (doc as unknown as Record<string, unknown>)[framework] = r.members;
        if (r.note) (doc as unknown as Record<string, string>)[`${framework}Note`] = r.note;
      }
    }

    handle('react', source.react, (e) => adapters.react(e.file, e.propsType));
    handle('vue', source.vue, (e) => adapters.vue(e.file, e.propsType));
    handle('svelte', source.svelte, (e) => adapters.svelte(e.file, e.propsType));
    handle('angular', source.angular, (e) => adapters.angular(e.file, e.className));

    write(slug, doc);
  }
}

type PropDocArray = NamedPropSection['members'];

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
