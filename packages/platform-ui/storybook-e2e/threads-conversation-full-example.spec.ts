import { test, expect } from '@playwright/test';

const crashSignatures = [
  "Cannot read properties of undefined (reading 'index')",
  "reading 'index'",
];

test.describe('Storybook Threads Conversation Full example', () => {
  test('renders without Virtuoso undefined index crash', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('pageerror', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      consoleErrors.push(message);
      console.log('[pageerror]', message);
    });

    page.on('console', async (message) => {
      if (message.type() !== 'error') {
        return;
      }
      let text = message.text();
      try {
        const args = await Promise.all(message.args().map(async (arg) => {
          try {
            return await arg.jsonValue();
          } catch (_error) {
            return String(arg);
          }
        }));
        if (args.length > 0) {
          text = `${text} ${JSON.stringify(args)}`;
        }
      } catch (_error) {
        // ignore argument introspection errors
      }
      consoleErrors.push(text);
      console.log('[console.error]', text);
    });

    await page.goto('/iframe?id=screens-threads-conversation--full-example&debug=1');

    const conversation = page.locator('[data-testid="conversation"]');
    await expect(conversation).toBeVisible();

    // Allow async renders to settle and surface potential crashes.
    await page.waitForTimeout(500);

    const hasCrash = consoleErrors.some((entry) =>
      crashSignatures.some((signature) => entry.includes(signature)),
    );

    expect(hasCrash, `Console errors:\n${consoleErrors.join('\n')}`).toBe(false);
  });
});
