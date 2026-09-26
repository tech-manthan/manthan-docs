import { InterfaceDeclaration, Node, PropertySignature, ExpressionWithTypeArguments, SyntaxKind, Type, TypeFormatFlags } from 'ts-morph';
import type { PropDoc } from './types';

// "Internal" means resolvable to our own source (any Manthan repo, including a
// local type alias like `type ButtonVariants = VariantProps<typeof button>` in
// manthan-react itself) rather than a third-party package. Anything ts-morph
// resolves into node_modules — React's ComponentProps, Svelte's
// HTMLButtonAttributes, etc. — is external, EXCEPT a published @manthan/*
// package: today `file:../manthan-base` devDependencies realpath-resolve
// outside node_modules entirely (which is why the plain node_modules check
// happens to work), but once npm-published versions replace those links
// (roadmap item 2), @manthan/*'s declarations resolve to genuine
// node_modules/@manthan/* paths — still our own source, not a third party.
export function isInternalDeclaration(filePath: string): boolean {
  return !filePath.includes('node_modules') || /node_modules[\\/]@manthan[\\/]/.test(filePath);
}

export function jsDocOf(node: PropertySignature): { description?: string; default?: string } {
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

export function walkType(type: Type, contextNode: Node): PropDoc[] {
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

// Walks a type NODE (AST), not a resolved Type — needed for a type alias
// like `ToggleGroupProps = ToggleGroupBase & (UnionBranchA | UnionBranchB)`
// where `ToggleGroupBase = Omit<ComponentProps<'div'>, 'defaultValue' |
// 'onChange'> & {...}`. Calling walkType on the whole alias's *resolved*
// Type (as this file used to) leaks every native <div> attribute TypeScript's
// built-in `Omit<T, K>` didn't happen to name in K — Omit only removes the
// named keys, it doesn't mark "the rest of T" as external the way this
// pipeline's own internal/external rule does for a heritage clause. Walking
// the AST node-by-node lets the SAME internal/external rule apply inside an
// intersection, not just at a top-level `extends`.
export function walkTypeNode(node: Node): PropDoc[] {
  if (Node.isParenthesizedTypeNode(node)) return walkTypeNode(node.getTypeNode());
  if (Node.isIntersectionTypeNode(node)) return node.getTypeNodes().flatMap((n) => walkTypeNode(n));
  if (Node.isTypeLiteral(node)) {
    return node.getMembers().flatMap((m) => {
      if (!Node.isPropertySignature(m)) return [];
      const { description, default: def } = jsDocOf(m);
      return [
        {
          name: m.getName(),
          type: (m.getTypeNode() ?? m.getType()).getText(),
          required: !m.hasQuestionToken(),
          ...(def ? { default: def } : {}),
          ...(description ? { description } : {}),
        },
      ];
    });
  }
  if (isTypeReference(node)) {
    const name = node.getTypeName().getText();
    if (name === 'Omit') {
      const [innerNode, keysNode] = node.getTypeArguments();
      const omitted = keysNode
        .getText()
        .split('|')
        .map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''));
      if (isInternalTypeNode(innerNode)) return walkTypeNode(innerNode).filter((p) => !omitted.includes(p.name));
      return []; // external (e.g. ComponentProps<'div'>) — skip, matching the note-not-enumerate rule
    }
    // A generic reference (e.g. `VariantProps<typeof button>`, a CVA-style
    // computed/mapped type) needs the type CHECKER's substitution, which AST
    // recursion into the alias's own (still-generic) definition can't
    // reproduce — fall back to the proven Type-API resolution for those.
    // A plain, non-generic reference (e.g. `ToggleGroupBase`, no `<...>`)
    // has nothing to substitute, so recursing into its own definition is
    // both safe and necessary — it's exactly how an Omit<Native,...> buried
    // two names deep still gets the internal/external rule applied to it.
    if (node.getTypeArguments().length > 0) return walkType(node.getType(), node);
    if (!isInternalTypeNode(node)) return [];
    const decl = declarationOf(node);
    if (decl && Node.isInterfaceDeclaration(decl)) {
      const own = walkInterfaceMembers(decl);
      const inherited = decl.getExtends().flatMap((h) => resolveHeritage(h).members);
      return [...inherited, ...own];
    }
    if (decl && Node.isTypeAliasDeclaration(decl)) return walkTypeNode(decl.getTypeNodeOrThrow());
    return [];
  }
  // A union (e.g. the parenthesized discriminated union above) or anything
  // else — the resolved Type API already handles a union of plain object
  // types correctly (TypeScript flattens `B | C`'s apparent members), which
  // is exactly the shape left once Omit/named-reference cases are handled above.
  return walkType(node.getType(), node);
}

function declarationOf(node: Node): Node | undefined {
  const type = node.getType();
  const symbol = type.getSymbol() ?? type.getAliasSymbol();
  return symbol?.getDeclarations()?.[0];
}

function isInternalTypeNode(node: Node): boolean {
  const decl = declarationOf(node);
  return !!decl && isInternalDeclaration(decl.getSourceFile().getFilePath());
}

export function resolveHeritage(heritage: ExpressionWithTypeArguments): { members: PropDoc[]; note?: string } {
  const { target, omitted } = unwrapOmit(heritage);
  const typeText = target.getText();
  const type = target.getType();
  const symbol = type.getSymbol() ?? type.getAliasSymbol();
  const decl = symbol?.getDeclarations()?.[0];
  if (decl && isInternalDeclaration(decl.getSourceFile().getFilePath())) {
    // A plain interface recurses through its OWN `extends` clauses (own AST
    // members via walkInterfaceMembers, plus resolveHeritage again on each
    // of its own heritage clauses) rather than walking its full resolved
    // Type — found via real extraction against Checkbox: `CheckboxProps
    // extends ChoiceProps extends Omit<ComponentProps<'input'>, ...>`.
    // ChoiceProps is internal (walk it), but ChoiceProps' OWN heritage is
    // external — walking ChoiceProps' full *apparent* type (via walkType)
    // flattens in everything ChoiceProps itself inherited, native <input>
    // attributes included: ChoiceProps being internal doesn't make its own
    // external heritage internal too. Recursing with the same
    // internal/external rule at each hop is what the pilot's other
    // resolution paths (extractReactPropsFromProject, etc.) already do for
    // the TOP-level interface; this makes resolveHeritage do the same for
    // every internal interface it walks, not just the outermost one.
    if (Node.isInterfaceDeclaration(decl)) {
      const own = walkInterfaceMembers(decl);
      const inherited: PropDoc[] = [];
      const notes: string[] = [];
      for (const h of decl.getExtends()) {
        const r = resolveHeritage(h);
        inherited.push(...r.members);
        if (r.note) notes.push(r.note);
      }
      return { members: [...inherited, ...own].filter((p) => !omitted.includes(p.name)), note: notes[0] };
    }
    // Not a plain interface (e.g. a type alias like `VariantProps<typeof
    // button>` or `ToggleGroupBase & (...)`) — TypeScript type aliases can't
    // have their own `extends` clause, so there's no further internal/
    // external hop to recurse into here; walking the full resolved Type is
    // safe and is still the only way to resolve a computed/mapped shape.
    return { members: walkType(type, target).filter((p) => !omitted.includes(p.name)) };
  }
  return { members: [], note: `Also accepts standard ${typeText} attributes.` };
}
