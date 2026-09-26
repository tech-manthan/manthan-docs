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
  input: {
    react: { file: '../manthan-react/src/components/form.tsx', propsType: 'InputProps' },
    vue: { file: '../manthan-vue/src/components/Input.vue' },
    svelte: { file: '../manthan-svelte/src/lib/components/Input.svelte', propsType: 'Props' },
    angular: { file: '../manthan-angular/projects/manthan/src/lib/form.ts', className: 'MnInput' },
  },
  dialog: {
    react: { file: '../manthan-react/src/components/overlay.tsx', propsType: 'DialogProps' },
    vue: { file: '../manthan-vue/src/components/Dialog.vue' },
    svelte: { file: '../manthan-svelte/src/lib/components/Dialog.svelte', propsType: 'Props' },
    angular: { file: '../manthan-angular/projects/manthan/src/lib/overlay.ts', className: 'MnDialog' },
  },
  'data-table': {
    react: { file: '../manthan-react/src/components/data-table.tsx', propsType: 'DataTableProps' },
    vue: { file: '../manthan-vue/src/components/DataTable.vue' },
    svelte: { file: '../manthan-svelte/src/lib/components/DataTable.svelte', propsType: 'Props' },
    angular: { file: '../manthan-angular/projects/manthan/src/lib/data-table.ts', className: 'MnDataTable' },
  },
  chart: {
    react: { file: '../manthan-react/src/components/chart.tsx', propsType: 'ChartProps' },
    vue: { file: '../manthan-vue/src/components/Chart.vue' },
    svelte: { file: '../manthan-svelte/src/lib/components/Chart.svelte', propsType: 'Props' },
    angular: { file: '../manthan-angular/projects/manthan/src/lib/chart.ts', className: 'MnChart' },
  },
};
