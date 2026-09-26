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

  it('keeps real JSDoc on a bindable model(), instead of always overwriting it with "Two-way bindable."', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile(
      'input.ts',
      `class MnInput {
        /** The controlled value. */
        readonly value = model('');
      }`,
    );
    const members = propsFromClass(file.getClassOrThrow('MnInput'));
    expect(members).toEqual([
      { name: 'value', type: 'string', required: false, default: "''", description: 'Two-way bindable. The controlled value.' },
    ]);
  });

  it('uses the alias option as the documented prop name when present (real binding name differs from the class property, e.g. a cell renderer\'s `key` input aliased to `mnCell`)', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile(
      'cell.ts',
      `class MnCell {
        readonly key = input.required<string>({ alias: 'mnCell' });
      }`,
    );
    const members = propsFromClass(file.getClassOrThrow('MnCell'));
    expect(members).toEqual([{ name: 'mnCell', type: 'string', required: true }]);
  });

  it('throws when the named class is missing', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('a.ts', `class Other {}`);
    expect(() => propsFromClass(project.getSourceFileOrThrow('a.ts').getClass('MnButton'))).toThrow();
  });
});
