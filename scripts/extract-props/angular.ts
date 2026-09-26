import { CallExpression, ClassDeclaration, Node, ObjectLiteralExpression, PropertyDeclaration, Project } from 'ts-morph';
import type { PropDoc } from './types';

function literalTypeOf(node: Node): string {
  if (Node.isFalseLiteral(node) || Node.isTrueLiteral(node)) return 'boolean';
  if (Node.isNumericLiteral(node)) return 'number';
  if (Node.isStringLiteral(node)) return 'string';
  return node.getType().getText();
}

// `input(default, { alias, transform })`'s options object is the one call
// argument `literalTypeOf`'s default-inference must skip (it's never the
// input's own default value) — also the only place an `alias` can be read
// from, since `input`/`model` change the real template binding name via
// `alias`, not the class property name (e.g. a cell renderer's `key`
// property bound as `[mnCell]`, not `[key]`).
function optionsArgOf(init: CallExpression) {
  return init.getArguments().find((a): a is ObjectLiteralExpression => Node.isObjectLiteralExpression(a));
}

function aliasOf(options: ObjectLiteralExpression | undefined): string | undefined {
  const prop = options?.getProperty('alias');
  if (!prop || !Node.isPropertyAssignment(prop)) return undefined;
  const initializer = prop.getInitializer();
  return initializer && Node.isStringLiteral(initializer) ? initializer.getLiteralText() : undefined;
}

function propFromInputCall(prop: PropertyDeclaration): PropDoc | undefined {
  const init = prop.getInitializer();
  if (!init || !Node.isCallExpression(init)) return undefined;
  const callee = init.getExpression().getText();
  if (callee !== 'input' && callee !== 'input.required' && callee !== 'model' && callee !== 'model.required') return undefined;

  const required = callee === 'input.required' || callee === 'model.required';
  const bindable = callee === 'model' || callee === 'model.required';
  const [typeArg] = init.getTypeArguments();
  const options = optionsArgOf(init);
  const [defaultArg] = init.getArguments().filter((a) => a !== options);
  const type = typeArg ? typeArg.getText() : defaultArg ? literalTypeOf(defaultArg) : 'unknown';
  const doc = prop.getJsDocs()[0]?.getDescription().trim();
  // Spec: bindable props get "Two-way bindable." prefixed only when there's
  // no real JSDoc to lose — real JSDoc is kept (with the prefix), not
  // discarded, matching how a non-bindable input's JSDoc already survives.
  const description = bindable ? (doc ? `Two-way bindable. ${doc}` : 'Two-way bindable.') : doc;

  return {
    name: aliasOf(options) ?? prop.getName(),
    type,
    required,
    ...(defaultArg ? { default: defaultArg.getText() } : {}),
    ...(description ? { description } : {}),
  };
}

function propFromInputDecorator(prop: PropertyDeclaration): PropDoc | undefined {
  const decorator = prop.getDecorator('Input');
  if (!decorator) return undefined;
  const doc = prop.getJsDocs()[0]?.getDescription().trim();
  return {
    name: prop.getName(),
    type: (prop.getTypeNode() ?? prop.getType()).getText(),
    required: !prop.hasQuestionToken() && !prop.getInitializer(),
    ...(doc ? { description: doc } : {}),
  };
}

export function propsFromClass(cls: ClassDeclaration | undefined): PropDoc[] {
  if (!cls) throw new Error('Angular adapter: class not found');
  const props: PropDoc[] = [];
  for (const prop of cls.getProperties()) {
    const found = propFromInputCall(prop) ?? propFromInputDecorator(prop);
    if (found) props.push(found);
  }
  return props;
}

// Cached across calls within one orchestrator run — see react.ts's identical comment.
let cachedProject: Project | undefined;

export function extractAngularProps(file: string, className: string): { members: PropDoc[]; note?: string } {
  cachedProject ??= new Project({ tsConfigFilePath: `${process.cwd()}/../manthan-angular/projects/manthan/tsconfig.lib.json` });
  const source = cachedProject.getSourceFileOrThrow(file);
  return { members: propsFromClass(source.getClass(className)) };
}
