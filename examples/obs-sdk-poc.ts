import { init, withSpan } from '../packages/obs-sdk/src/index';

async function main() {
  init({
    mode: 'extended',
    endpoints: { extended: 'http://localhost:4319' },
    defaultAttributes: { service: 'poc-app' }
  });
  await withSpan({ label: 'poc-root' }, async () => {
    await withSpan({ label: 'child-1' }, async () => {
      await new Promise(r => setTimeout(r, 300));
    });
  });
}

main().catch(console.error);
