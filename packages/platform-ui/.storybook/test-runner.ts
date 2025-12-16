import type { TestRunnerConfig } from '@storybook/test-runner';
import type { ConsoleMessage, Page } from 'playwright';

type ListenerRegistry = WeakMap<Page, () => void>;

const listenerRegistry: ListenerRegistry = new WeakMap();

const config: TestRunnerConfig = {
  tags: {
    skip: ['test:skip'],
  },
  async preVisit(page, context) {
    listenerRegistry.get(page)?.();
    listenerRegistry.delete(page);

    const handlePageError = (error: Error) => {
      throw new Error(`[${context.id}] page error: ${error.message}`, {
        cause: error,
      });
    };

    const handleConsole = (message: ConsoleMessage) => {
      if (message.type() !== 'error') {
        return;
      }

      throw new Error(
        `[${context.id}] console.error: ${message.text()}`,
      );
    };

    page.on('pageerror', handlePageError);
    page.on('console', handleConsole);

    listenerRegistry.set(page, () => {
      page.off('pageerror', handlePageError);
      page.off('console', handleConsole);
    });
  },
  async postVisit(page) {
    listenerRegistry.get(page)?.();
    listenerRegistry.delete(page);
  },
};

export default config;
