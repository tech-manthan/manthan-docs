import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { propsFromClass } from './angular';

describe('propsFromClass', () => {
  it('reads input(), input.required(), input(default, {transform}) and model()', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile(
      'button.ts',
      `class MnButton {
        readonly variant = input<'solid' | 'soft'>();
        readonly columns = input.required<string[]>();
        readonly loading = input(false, { transform: booleanAttribute });
        readonly open = model(false);
        /** Shows a spinner. */
        readonly disabled = input(false);
      }`,
    );
    const members = propsFromClass(file.getClassOrThrow('MnButton'));
    expect(members).toEqual([
      { name: 'variant', type: "'solid' | 'soft'", required: false },
      { name: 'columns', type: 'string[]', required: true },
      { name: 'loading', type: 'boolean', required: false, default: 'false' },
      { name: 'open', type: 'boolean', required: false, default: 'false', description: 'Two-way bindable.' },
      { name: 'disabled', type: 'boolean', required: false, default: 'false', description: 'Shows a spinner.' },
    ]);
  });

  it('throws when the named class is missing', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('a.ts', `class Other {}`);
    expect(() => propsFromClass(project.getSourceFileOrThrow('a.ts').getClass('MnButton'))).toThrow();
  });
});
