import { createContext } from 'react';
import type { TemplateNodeSchema } from '@agyn/shared';

export interface TemplatesContextValue {
  templates: TemplateNodeSchema[];
}

export const TemplatesContext = createContext<TemplatesContextValue>({ templates: [] });
