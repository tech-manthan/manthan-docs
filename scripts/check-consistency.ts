import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { componentRegistry } from '../src/data/component-registry';

export function checkConsistency(contentDir: string, readdir: (dir: string) => string[] = readdirSync): string[] {
  const mdxSlugs = new Set(readdir(contentDir).map((f) => f.replace(/\.mdx$/, '')));
  const registrySlugs = new Set(Object.keys(componentRegistry));
  const problems: string[] = [];
  for (const slug of mdxSlugs) if (!registrySlugs.has(slug)) problems.push(`${slug}.mdx has no component-registry entry`);
  for (const slug of registrySlugs) if (!mdxSlugs.has(slug)) problems.push(`component-registry has "${slug}" but no ${slug}.mdx`);
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
