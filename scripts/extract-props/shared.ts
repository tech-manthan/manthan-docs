import { InterfaceDeclaration, Node, PropertySignature, ExpressionWithTypeArguments } from 'ts-morph';
import type { PropDoc } from './types';

export function isInternalDeclaration(filePath: string): boolean {
  return filePath.includes('manthan-base');
}

function jsDocOf(node: PropertySignature): { description?: string; default?: string } {
  const doc = node.getJsDocs()[0];
  if (!doc) return {};
  const description = doc.getDescription().trim() || undefined;
  const defaultTag = doc.getTags().find((t) => t.getTagName() === 'default');
  return { description, default: defaultTag?.getCommentText()?.trim() };
}

export function walkInterfaceMembers(iface: InterfaceDeclaration): PropDoc[] {
  return iface.getProperties().map((prop) => {
    const { description, default: def } = jsDocOf(prop);
    return {
      name: prop.getName(),
      type: (prop.getTypeNode() ?? prop.getType()).getText(),
      required: !prop.hasQuestionToken(),
      ...(def ? { default: def } : {}),
      ...(description ? { description } : {}),
    };
  });
}

function unwrapOmit(node: Node): { target: Node; omitted: string[] } {
  if (!Node.isExpressionWithTypeArguments(node) && !Node.isTypeReferenceNode(node)) {
    return { target: node, omitted: [] };
  }
  const name = Node.isExpressionWithTypeArguments(node) ? node.getExpression().getText() : node.getTypeName().getText();
  if (name !== 'Omit') return { target: node, omitted: [] };
  const [innerType, keysType] = node.getTypeArguments();
  const omitted = keysType
    .getText()
    .split('|')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
  return { target: innerType, omitted };
}

export function resolveHeritage(heritage: ExpressionWithTypeArguments): { members: PropDoc[]; note?: string } {
  const { target, omitted } = unwrapOmit(heritage);
  const typeText = target.getText();
  const decl = target.getType().getSymbol()?.getDeclarations()?.[0];
  if (decl && Node.isInterfaceDeclaration(decl) && isInternalDeclaration(decl.getSourceFile().getFilePath())) {
    return { members: walkInterfaceMembers(decl).filter((p) => !omitted.includes(p.name)) };
  }
  return { members: [], note: `Also accepts standard ${typeText} attributes.` };
}
