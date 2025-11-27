import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';

const config: StorybookConfig = {
  stories: [
    '../stories/**/*.mdx',
    '../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(config) {
    return {
      ...config,
      resolve: {
        ...(config.resolve ?? {}),
        alias: {
          ...(config.resolve?.alias ?? {}),
          '@storybook/preview-api': 'storybook/preview-api',
        },
      },
      plugins: [
        ...(config.plugins ?? []), //
        tailwindcss(),
      ],
    };
  },
};
export default config;
