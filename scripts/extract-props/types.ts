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
  note?: string;
}
