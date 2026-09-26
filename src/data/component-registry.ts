export interface ComponentSource {
  react?: { file: string; propsType: string };
  vue?: { file: string; propsType?: string };
  svelte?: { file: string; propsType: string };
  angular?: { file: string; className: string };
}

export const componentRegistry: Record<string, ComponentSource> = {
  button: {
    react: { file: '../manthan-react/src/components/button.tsx', propsType: 'ButtonProps' },
    vue: { file: '../manthan-vue/src/components/Button.vue' },
    svelte: { file: '../manthan-svelte/src/lib/components/Button.svelte', propsType: 'Props' },
    angular: { file: '../manthan-angular/projects/manthan/src/lib/button.ts', className: 'MnButton' },
  },
};
