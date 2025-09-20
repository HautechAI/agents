import { FactoryFn } from './types';

export class TemplateRegistry {
  private factories = new Map<string, FactoryFn>();

  register(template: string, factory: FactoryFn): this {
    if (this.factories.has(template)) {
      // Allow override deliberately; could warn here if desired
    }
    this.factories.set(template, factory);
    return this;
  }

  get(template: string): FactoryFn | undefined {
    return this.factories.get(template);
  }
}
