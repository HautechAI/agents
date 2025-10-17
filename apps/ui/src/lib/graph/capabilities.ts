import type { TemplateSchema } from './types';

// Lifecycle-only: UI derives capabilities from presence of schemas and runtime status, not template flags.
export function hasStaticConfig(t: TemplateSchema): boolean {
  return !!t.staticConfigSchema;
}
export function hasStaticConfigByName(name: string, getTemplate: (n: string) => TemplateSchema | undefined): boolean {
  const t = getTemplate(name);
  return t ? hasStaticConfig(t) : false;
}
