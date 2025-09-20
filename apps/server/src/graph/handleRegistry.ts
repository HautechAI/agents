import { Endpoint, HandleRegistryLike } from './types';

// Simple default handle resolver; can be extended to register explicit per-template mappings.
// Currently this registry only offers an extension hook (no pre-registered handles).

export type HandleResolverFn = (instance: unknown, handle: string) => Endpoint | undefined;

interface TemplateHandleMap {
  [handle: string]: HandleResolverFn;
}

export class HandleRegistry implements HandleRegistryLike {
  private map = new Map<string, TemplateHandleMap>();

  register(template: string, handle: string, resolver: HandleResolverFn): this {
    const existing = this.map.get(template) ?? {};
    existing[handle] = resolver;
    this.map.set(template, existing);
    return this;
  }

  resolve(instance: any, template: string, handle: string): Endpoint | undefined { // eslint-disable-line @typescript-eslint/no-explicit-any
    const templateHandles = this.map.get(template);
    if (templateHandles && templateHandles[handle]) {
      return templateHandles[handle](instance, handle);
    }
    // fallback to direct property introspection done externally (GraphBuilder)
    return undefined;
  }
}
