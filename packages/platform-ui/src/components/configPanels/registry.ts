import {
  type ConfigPanelComponent,
  type ConfigPanelEntry,
  type ConfigPanelRegistration,
} from './types';

interface RegisteredComponent {
  component: ConfigPanelComponent;
  priority: number;
}

interface PanelBucket {
  both: RegisteredComponent[];
  static: RegisteredComponent[];
  dynamic: RegisteredComponent[];
}

function createBucket(): PanelBucket {
  return {
    both: [],
    static: [],
    dynamic: [],
  } satisfies PanelBucket;
}

function insertComponent(list: RegisteredComponent[], entry: RegisteredComponent) {
  list.push(entry);
  list.sort((a, b) => b.priority - a.priority);
}

const registry = new Map<string, PanelBucket>();

export function registerConfigPanel(entry: ConfigPanelRegistration) {
  const { template, component, priority = 0 } = entry;
  const mode = entry.mode ?? 'static';
  if (!template || typeof component !== 'function') {
    return;
  }
  const bucket = registry.get(template) ?? createBucket();
  registry.set(template, bucket);
  const target: RegisteredComponent = { component, priority };
  switch (mode) {
    case 'both':
      insertComponent(bucket.both, target);
      break;
    case 'dynamic':
      insertComponent(bucket.dynamic, target);
      break;
    case 'static':
    default:
      insertComponent(bucket.static, target);
      break;
  }
}

function pick(list: RegisteredComponent[]): ConfigPanelComponent | undefined {
  return list.length > 0 ? list[0].component : undefined;
}

export function getConfigPanel(template: string): ConfigPanelEntry | undefined {
  if (!template) return undefined;
  const bucket = registry.get(template);
  if (!bucket) return undefined;
  const entry: ConfigPanelEntry = { template };
  const combined = pick(bucket.both);
  if (combined) {
    entry.component = combined;
  } else {
    entry.staticComponent = pick(bucket.static);
    entry.dynamicComponent = pick(bucket.dynamic);
  }
  if (!entry.component && !entry.staticComponent && !entry.dynamicComponent) {
    return undefined;
  }
  return entry;
}

export function clearConfigPanelRegistry() {
  registry.clear();
}
