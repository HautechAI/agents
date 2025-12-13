import type { ComponentType } from 'react';

import type { McpToolDescriptor } from '@/components/nodeProperties/types';

export type ConfigPanelMode = 'static' | 'dynamic' | 'both';

export interface ConfigPanelContext {
  nodeId?: string;
  secretKeys?: string[];
  variableKeys?: string[];
  ensureSecretKeys?: () => Promise<string[]>;
  ensureVariableKeys?: () => Promise<string[]>;
  nix?: {
    search?: (query: string) => Promise<Array<{ value: string; label: string }>>;
    fetchVersions?: (name: string) => Promise<string[]>;
    resolve?: (
      name: string,
      version: string,
    ) => Promise<{ version: string; commitHash: string; attributePath: string }>;
  };
  mcp?: {
    tools?: McpToolDescriptor[];
    enabledTools?: string[] | null;
    toggleTool?: (toolName: string, nextEnabled: boolean) => void;
    loading?: boolean;
  };
}

export interface ConfigPanelProps {
  template: string;
  nodeId?: string;
  value: Record<string, unknown>;
  onChange: (partial: Record<string, unknown>) => void;
  readOnly?: boolean;
  disabled?: boolean;
  context?: ConfigPanelContext;
  onValidate?: (errors: string[]) => void;
}

export type ConfigPanelComponent = ComponentType<ConfigPanelProps>;

export interface ConfigPanelRegistration {
  template: string;
  component: ConfigPanelComponent;
  mode?: ConfigPanelMode;
  priority?: number;
}

export interface ConfigPanelEntry {
  template: string;
  component?: ConfigPanelComponent;
  staticComponent?: ConfigPanelComponent;
  dynamicComponent?: ConfigPanelComponent;
}
