export interface PropDoc {
  name: string;
  type: string;
  required: boolean;
  default?: string;
  description?: string;
}

export interface ComponentPropsDoc {
  slug: string;
  react?: PropDoc[];
  vue?: PropDoc[];
  svelte?: PropDoc[];
  angular?: PropDoc[];
  // Per framework, not a single shared field: each framework's heritage note
  // names ITS OWN native-element type (e.g. React's `ComponentProps<'button'>`
  // vs. Svelte's `HTMLButtonAttributes`) — a single global note picked from
  // whichever framework's adapter ran first showed React-flavored jargon
  // under every other framework's section.
  reactNote?: string;
  vueNote?: string;
  svelteNote?: string;
  angularNote?: string;
}
