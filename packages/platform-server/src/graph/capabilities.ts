import { JSONSchema } from 'zod/v4/core';

export interface DynamicConfigurable<Config = Record<string, unknown>> {
  isDynamicConfigReady(): boolean;
  getDynamicConfigSchema(): JSONSchema.BaseSchema | undefined;
  setDynamicConfig(cfg: Config): Promise<void> | void;
  onDynamicConfigChanged(listener: (cfg: Config) => void): () => void;
}

// // ---------- Type guards ----------
export function isDynamicConfigurable<Config = Record<string, unknown>>(
  obj: unknown,
): obj is DynamicConfigurable<Config> {
  return !!obj && typeof (obj as any).isDynamicConfigReady === 'function';
}

export type ProvisionStatus = { state: 'not_ready' | 'ready' | 'provisioning' | 'deprovisioning' | 'provisioning_error' | 'deprovisioning_error'; reason?: string };
export interface Provisionable {
  provision(): Promise<void> | void;
  deprovision(): Promise<void> | void;
  getProvisionStatus?: () => ProvisionStatus;
  onProvisionStatusChanged?: (listener: (s: ProvisionStatus) => void) => () => void;
}

// Named guards used by runtime (no default export)
export function hasSetConfig(x: unknown): x is { setConfig: (cfg: Record<string, unknown>) => unknown } {
  return !!x && typeof (x as any).setConfig === 'function';
}

export function hasSetDynamicConfig(x: unknown): x is { setDynamicConfig: (cfg: Record<string, unknown>) => unknown } {
  return !!x && typeof (x as any).setDynamicConfig === 'function';
}
