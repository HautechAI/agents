import type { Preview } from '@storybook/react-vite';
import { initConfigViewsRegistry } from '../src/configViews.init';
import { ScreenStoryProviders, type ScreenParameters } from './ScreenStoryProviders';
import '../src/styles/tailwind.css';
import '../src/styles/globals.css';
import '../src/styles/shadcn-compat.css';

initConfigViewsRegistry();

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    options: {
      storySort: {
        order: ['Brand', 'Foundation', 'Components', 'Layouts', 'Screens'],
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },
  decorators: [
    (Story, context) => {
      const screen = (context.parameters.screen ?? {}) as ScreenParameters;
      const routePath = screen.routePath ?? '*';
      const initialEntry = screen.initialEntry ?? '/';
      return (
        <ScreenStoryProviders routePath={routePath} initialEntry={initialEntry}>
          <Story />
        </ScreenStoryProviders>
      );
    },
  ],
};

export default preview;
