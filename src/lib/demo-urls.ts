export type Framework = 'react' | 'vue' | 'svelte' | 'angular';

const devPorts: Record<Framework, number> = { react: 5180, vue: 5181, svelte: 5182, angular: 4200 };

export function demoUrl(framework: Framework, slug: string): string {
  if (import.meta.env.DEV) {
    return `http://localhost:${devPorts[framework]}/?c=${slug}`;
  }
  // Root-absolute (not BASE_URL-relative) breaks under a sub-path deploy
  // (e.g. a GitHub Pages project page) — no deploy target is chosen yet,
  // but this costs nothing to get right now.
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/demos/${framework}/index.html?c=${slug}`;
}
