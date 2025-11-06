import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const server = setupServer(
  // Default handlers can be overridden per-test
  http.get('/api/secrets/summary', ({ request }) => {
    const url = new URL(request.url);
    const filter = url.searchParams.get('filter') || 'all';
    const items = [
      { ref: 'secret/app/api_key', mount: 'secret', path: 'app', key: 'api_key', status: 'used_present' },
      { ref: 'secret/app/miss', mount: 'secret', path: 'app', key: 'miss', status: 'used_missing' },
      { ref: 'secret/app/unused', mount: 'secret', path: 'app', key: 'unused', status: 'present_unused' },
    ];
    const filtered = filter === 'used' ? items.filter(i => i.status.startsWith('used'))
      : filter === 'missing' ? items.filter(i => i.status === 'used_missing')
      : items;
    return HttpResponse.json({ items: filtered, page: 1, page_size: 50, total: filtered.length, summary: { counts: { used_present: 1, used_missing: 1, present_unused: 1, invalid_ref: 0 } } });
  }),
  http.get('/api/secrets/secret/*app/api_key', ({ request }) => {
    const url = new URL(request.url);
    const reveal = url.searchParams.get('reveal');
    if (reveal === '1') {
      const token = request.headers.get('x-admin-token');
      if (token === 'adm') return HttpResponse.json({ ref: 'secret/app/api_key', masked: false, status: 'present', value: 'API-SECRET' });
      return HttpResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
    return HttpResponse.json({ ref: 'secret/app/api_key', masked: true, status: 'present', length: 10 });
  }),
);

