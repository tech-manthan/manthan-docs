import { InterfaceDeclaration, Node, PropertySignature, ExpressionWithTypeArguments, Type } from 'ts-morph';
import type { PropDoc } from './types';

// "Internal" means resolvable to our own source (any Manthan repo, including a
// local type alias like `type ButtonVariants = VariantProps<typeof button>` in
// manthan-react itself) rather than a third-party package. Anything ts-morph
// resolves into node_modules — React's ComponentProps, Svelte's
// HTMLButtonAttributes, etc. — is external.
export function isInternalDeclaration(filePath: string): boolean {
  return !filePath.includes('node_modules');
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

// A heritage target can be a plain interface (`extends ChartControllerOptions`)
// or a type alias to something computed (`type ButtonVariants =
// VariantProps<typeof button>`, then `extends ButtonVariants`) — walking the
// resolved Type's properties, rather than only an InterfaceDeclaration's own
// AST members, handles both uniformly.
// getTypeAtLocation resolves the property's *actual* substituted type — the
// only reliable option for a mapped/generic-computed type like Manthan's own
// `VariantProps<typeof button>` (a CVA-style helper), where the property
// symbol's own declaration site points at the recipe's internal config shape,
// not the resulting literal union. The cost is cosmetic noise this cleans up:
// TypeScript prints an optional property's apparent type with a trailing
// `| undefined` (redundant — `required` already conveys that) and normalizes
// string literals to double quotes (inconsistent with the single-quoted style
// every framework's own source uses).
function cleanTypeText(type: Type, isOptional: boolean): string {
  let text = type.getText();
  if (isOptional && text.endsWith(' | undefined')) text = text.slice(0, -' | undefined'.length);
  return text.replace(/"([^"]*)"/g, "'$1'");
}

function walkType(type: Type, contextNode: Node): PropDoc[] {
  return type.getProperties().map((symbol) => {
    const decl = symbol.getDeclarations().find((d): d is PropertySignature => Node.isPropertySignature(d));
    const doc = decl?.getJsDocs()[0];
    const description = doc?.getDescription().trim() || undefined;
    const defaultTag = doc?.getTags().find((t) => t.getTagName() === 'default');
    const required = !symbol.isOptional();
    return {
      name: symbol.getName(),
      type: cleanTypeText(symbol.getTypeAtLocation(contextNode), !required),
      required,
      ...(defaultTag ? { default: defaultTag.getCommentText()?.trim() } : {}),
      ...(description ? { description } : {}),
    };
  });
}

export function resolveHeritage(heritage: ExpressionWithTypeArguments): { members: PropDoc[]; note?: string } {
  const { target, omitted } = unwrapOmit(heritage);
  const typeText = target.getText();
  const type = target.getType();
  const symbol = type.getSymbol() ?? type.getAliasSymbol();
  const decl = symbol?.getDeclarations()?.[0];
  if (decl && isInternalDeclaration(decl.getSourceFile().getFilePath())) {
    return { members: walkType(type, target).filter((p) => !omitted.includes(p.name)) };
  }
  return { members: [], note: `Also accepts standard ${typeText} attributes.` };
}
