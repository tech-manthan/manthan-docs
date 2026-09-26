import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { extractReactPropsFromProject } from './react';

describe('extractReactPropsFromProject', () => {
  it('extracts own members and notes a foreign extends', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/repo/node_modules/react/index.d.ts', `export interface Foreign { onClick?: () => void; }`);
    project.createSourceFile(
      '/repo/manthan-react/src/components/button.tsx',
      `import type { Foreign } from 'react';
       export interface ButtonProps extends Foreign {
         /** Shows a spinner. */
         loading?: boolean;
       }`,
    );
    const result = extractReactPropsFromProject(project, '/repo/manthan-react/src/components/button.tsx', 'ButtonProps');
    expect(result.members).toEqual([{ name: 'loading', type: 'boolean', required: false, description: 'Shows a spinner.' }]);
    expect(result.note).toContain('Foreign');
  });

  it('reads a destructuring default from the component function whose parameter is typed with propsType (spec: "default comes from a destructuring default or an @default JSDoc tag")', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/repo/manthan-react/src/components/dialog.tsx',
      `export interface DialogProps {
         closeOnEscape?: boolean;
         title: string;
       }
       export function Dialog({ closeOnEscape = true, title }: DialogProps) {
         return null;
       }`,
    );
    const result = extractReactPropsFromProject(project, '/repo/manthan-react/src/components/dialog.tsx', 'DialogProps');
    expect(result.members).toEqual([
      { name: 'closeOnEscape', type: 'boolean', required: false, default: 'true' },
      { name: 'title', type: 'string', required: true },
    ]);
  });

  it('resolves a type alias (not just an interface), including an intersection-of-union shape (regression: real ToggleGroupProps)', () => {
    const project = new Project({ tsConfigFilePath: `${process.cwd()}/../manthan-react/tsconfig.json` });
    const result = extractReactPropsFromProject(project, `${process.cwd()}/../manthan-react/src/components/advanced.tsx`, 'ToggleGroupProps');
    const byName = new Map(result.members.map((m) => [m.name, m]));
    expect(byName.get('variant')).toEqual({ name: 'variant', type: "'segmented' | 'outline' | 'ghost'", required: false });
    expect(byName.get('orientation')).toEqual({ name: 'orientation', type: "'horizontal' | 'vertical'", required: false });
    expect(byName.get('type')).toBeDefined();
    expect(byName.get('type')!.type).toContain('single');
    expect(byName.get('type')!.type).toContain('multiple');
    expect(byName.get('value')).toBeDefined();
    expect(byName.has('onClick')).toBe(false);
  });

  it('CheckboxProps\' own members merge with its inherited (unexported) ChoiceProps members, with no native leak, through the full extractReactPropsFromProject entry point (regression: real Checkbox — see shared.test.ts for the underlying resolveHeritage fix)', () => {
    const project = new Project({ tsConfigFilePath: `${process.cwd()}/../manthan-react/tsconfig.json` });
    const result = extractReactPropsFromProject(project, `${process.cwd()}/../manthan-react/src/components/form.tsx`, 'CheckboxProps');
    const byName = new Map(result.members.map((m) => [m.name, m]));
    expect(byName.get('indeterminate')).toEqual({ name: 'indeterminate', type: 'boolean', required: false, default: 'false' });
    expect(byName.get('onCheckedChange')).toEqual({ name: 'onCheckedChange', type: '(checked: boolean) => void', required: false });
    expect(byName.get('size')).toBeDefined();
    expect(byName.get('tone')).toBeDefined();
    expect(byName.get('label')).toBeDefined();
    expect(byName.get('description')).toBeDefined();
    expect(result.members.length).toBe(6);
  });

  it('resolves an extends reference to a sibling component\'s own Props in the same file, with no native leak (regression: real DatePickerProps extends CalendarProps extends Omit<ComponentProps<\'div\'>, ...>)', () => {
    const project = new Project({ tsConfigFilePath: `${process.cwd()}/../manthan-react/tsconfig.json` });
    const calendar = extractReactPropsFromProject(project, `${process.cwd()}/../manthan-react/src/components/advanced.tsx`, 'CalendarProps');
    const datePicker = extractReactPropsFromProject(project, `${process.cwd()}/../manthan-react/src/components/advanced.tsx`, 'DatePickerProps');
    const calendarNames = new Set(calendar.members.map((m) => m.name));
    const datePickerNames = new Set(datePicker.members.map((m) => m.name));
    for (const name of calendarNames) {
      if (name === 'autoFocus') continue;
      expect(datePickerNames.has(name)).toBe(true);
    }
    expect(datePickerNames.has('autoFocus')).toBe(false);
    expect(datePickerNames.has('className')).toBe(true);
    expect(calendarNames.has('onClick')).toBe(false);
    expect(datePickerNames.has('onClick')).toBe(false);
    expect(calendar.members.length).toBe(11);
    expect(datePicker.members.length).toBe(17);
  });

  it('throws when the named interface is missing', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/repo/a.tsx', `export interface Other {}`);
    expect(() => extractReactPropsFromProject(project, '/repo/a.tsx', 'ButtonProps')).toThrow(/ButtonProps/);
  });
});
