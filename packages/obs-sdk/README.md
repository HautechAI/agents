# @hautech/obs-sdk

Stage 1 observability SDK for Node 18+. See docs in repo root for full scope.

Quick start:

```ts
import { init, withSpan } from '@hautech/obs-sdk';

init({
  mode: 'extended',
  endpoints: { extended: 'http://localhost:4319' },
  defaultAttributes: { service: 'demo' }
});

await withSpan({ label: 'demo' }, async () => {
  // do work
});
```
