import type { EnvItem } from './env.service';

export function normalizeEnvItems(
  items: Array<{ key?: string; name?: string; value: unknown }>,
): EnvItem[] {
  return items.map((item) => ({
    name: item.name && item.name.length ? item.name : item.key ?? '',
    value: item.value,
  })) as EnvItem[];
}
