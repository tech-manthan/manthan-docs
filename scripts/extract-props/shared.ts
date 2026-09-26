import { InterfaceDeclaration, Node, PropertySignature, ExpressionWithTypeArguments, SyntaxKind, Type, TypeFormatFlags } from 'ts-morph';
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

// `Node.isTypeReferenceNode` doesn't exist as a generated guard in this
// ts-morph version (same gap as the Vue adapter's defineProps branch —
// see vue.ts). `Node.is(SyntaxKind.TypeReference)` is the equivalent guard.
const isTypeReference = Node.is(SyntaxKind.TypeReference);

function unwrapOmit(node: Node): { target: Node; omitted: string[] } {
  if (!Node.isExpressionWithTypeArguments(node) && !isTypeReference(node)) {
    return { target: node, omitted: [] };
  }
  const name = Node.isExpressionWithTypeArguments(node) ? node.getExpression().getText() : node.getTypeName().getText();
  if (name !== 'Omit') return { target: node, omitted: [] };
  const [innerType, keysType] = node.getTypeArguments();
  const omitted = keysType
    .getText()
    .split('|')
    .map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''));
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
// UseAliasDefinedOutsideCurrentScope makes the printer prefer a visible type
// alias's own name (e.g. `ChartType`) over expanding or dynamically
// import()-referencing it. Without it, a named export whose declaration site
// isn't imported into contextNode's file — true of every heritage member,
// since the target interface only imports the *options* type, not each of
// its property types individually — prints via its resolved declaration
// file instead. For a library built with dts-bundling (tsup/rollup-plugin-dts),
// that file is a rolled-up internal chunk with mangled, non-public names
// (`import('.../chart-CsGmkoee').k` instead of `ChartType`), found via real
// extraction against manthan-react's built Chart component.
function cleanTypeText(type: Type, contextNode: Node, isOptional: boolean): string {
  let text = type.getText(contextNode, TypeFormatFlags.UseAliasDefinedOutsideCurrentScope);
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
      type: cleanTypeText(symbol.getTypeAtLocation(contextNode), contextNode, !required),
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
