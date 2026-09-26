import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Node, Project } from 'ts-morph';
import { componentRegistry, type ComponentSource } from '../src/data/component-registry';

type Framework = 'react' | 'vue' | 'svelte' | 'angular';

// Each framework's demo registry is parsed statically (never imported/
// executed) — importing registry.tsx would need a JSX transform and would
// pull in the whole component library and its browser-only DOM calls,
// far too heavy for a Node CLI check. All four shapes (a `demos` object
// literal, `as const` or typed, exported or not) reduce to the same walk.
export function demoRegistryKeys(source: string): string[] {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile('demos.tsx', source);
  const decl = file.getVariableDeclaration('demos');
  if (!decl) throw new Error('demo registry: no "demos" declaration found');
  let init = decl.getInitializerOrThrow();
  if (Node.isAsExpression(init)) init = init.getExpression();
  if (!Node.isObjectLiteralExpression(init)) throw new Error('demo registry: "demos" is not an object literal');
  return init.getProperties().map((p) => {
    if (!Node.isPropertyAssignment(p) && !Node.isShorthandPropertyAssignment(p)) {
      throw new Error('demo registry: unsupported "demos" property shape');
    }
    return p.getName().replace(/^['"]|['"]$/g, '');
  });
}

const demoRegistryFiles: Record<Framework, string> = {
  react: '../manthan-react/demos/registry.tsx',
  vue: '../manthan-vue/demos/registry.ts',
  svelte: '../manthan-svelte/demos/registry.ts',
  angular: '../manthan-angular/projects/playground/src/demo.ts',
};

export function checkConsistency(
  contentDir: string,
  readdir: (dir: string) => string[] = readdirSync,
  readDemoKeys: (framework: Framework) => Set<string> = (fw) => new Set(demoRegistryKeys(readFileSync(demoRegistryFiles[fw], 'utf-8'))),
): string[] {
  const mdxSlugs = new Set(readdir(contentDir).map((f) => f.replace(/\.mdx$/, '')));
  const registrySlugs = new Set(Object.keys(componentRegistry));
  const problems: string[] = [];
  for (const slug of mdxSlugs) if (!registrySlugs.has(slug)) problems.push(`${slug}.mdx has no component-registry entry`);
  for (const slug of registrySlugs) if (!mdxSlugs.has(slug)) problems.push(`component-registry has "${slug}" but no ${slug}.mdx`);

  // A slug missing from a framework's demo registry ships an iframe that
  // silently says "Demo not found" while everything else — build, tests,
  // extract-props — stays green (the plan's own named Content/data-drift
  // risk; this catches the specific case the MDX-vs-registry check above
  // doesn't).
  const frameworks: Framework[] = ['react', 'vue', 'svelte', 'angular'];
  for (const fw of frameworks) {
    const demoKeys = readDemoKeys(fw);
    for (const [slug, source] of Object.entries(componentRegistry) as [string, ComponentSource][]) {
      if (source[fw] && !demoKeys.has(slug)) problems.push(`component-registry has "${slug}" (${fw}) but ${demoRegistryFiles[fw]} has no matching demo`);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkConsistency('src/content/components');
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('Content and registry are consistent.');
}
