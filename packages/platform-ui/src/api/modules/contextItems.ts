import { asData, http } from '@/api/http';
import type { ContextItem } from '@/api/types/agents';

function buildQuery(ids: string[]): string {
  if (!Array.isArray(ids) || ids.length === 0) return '';
  return ids.map((id) => `ids=${encodeURIComponent(id)}`).join('&');
}

export const contextItems = {
  async getMany(ids: string[]): Promise<ContextItem[]> {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const query = buildQuery(ids);
    const path = query.length > 0 ? `/api/agents/context-items?${query}` : '/api/agents/context-items';
    const { items } = await asData<{ items: ContextItem[] }>(http.get(path));
    return Array.isArray(items) ? items : [];
  },
};
