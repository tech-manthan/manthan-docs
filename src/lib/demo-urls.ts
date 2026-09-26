export type Framework = 'react' | 'vue' | 'svelte' | 'angular';

const devPorts: Record<Framework, number> = { react: 5180, vue: 5181, svelte: 5182, angular: 4200 };

export function demoUrl(framework: Framework, slug: string): string {
  if (import.meta.env.DEV) {
    return `http://localhost:${devPorts[framework]}/?c=${slug}`;
  }
  return `/demos/${framework}/index.html?c=${slug}`;
}
