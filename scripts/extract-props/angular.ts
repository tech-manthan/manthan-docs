import { ClassDeclaration, Node, PropertyDeclaration, Project } from 'ts-morph';
import type { PropDoc } from './types';

function literalTypeOf(node: Node): string {
  if (Node.isFalseLiteral(node) || Node.isTrueLiteral(node)) return 'boolean';
  if (Node.isNumericLiteral(node)) return 'number';
  if (Node.isStringLiteral(node)) return 'string';
  return node.getType().getText();
}

function propFromInputCall(prop: PropertyDeclaration): PropDoc | undefined {
  const init = prop.getInitializer();
  if (!init || !Node.isCallExpression(init)) return undefined;
  const callee = init.getExpression().getText();
  if (callee !== 'input' && callee !== 'input.required' && callee !== 'model' && callee !== 'model.required') return undefined;

  const required = callee === 'input.required' || callee === 'model.required';
  const bindable = callee === 'model' || callee === 'model.required';
  const [typeArg] = init.getTypeArguments();
  const [defaultArg] = init.getArguments().filter((a) => !Node.isObjectLiteralExpression(a));
  const type = typeArg ? typeArg.getText() : defaultArg ? literalTypeOf(defaultArg) : 'unknown';
  const doc = prop.getJsDocs()[0]?.getDescription().trim();

  return {
    name: prop.getName(),
    type,
    required,
    ...(defaultArg ? { default: defaultArg.getText() } : {}),
    ...(bindable ? { description: 'Two-way bindable.' } : doc ? { description: doc } : {}),
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

export function extractAngularProps(file: string, className: string): { members: PropDoc[]; note?: string } {
  const project = new Project({ tsConfigFilePath: `${process.cwd()}/../manthan-angular/projects/manthan/tsconfig.lib.json` });
  const source = project.getSourceFileOrThrow(file);
  return { members: propsFromClass(source.getClass(className)) };
}
