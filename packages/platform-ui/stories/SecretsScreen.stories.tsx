import type { Meta, StoryObj } from '@storybook/react';
import { SettingsSecretsScreen } from '@/components/screens/settings/SecretsScreen';
import { withMainLayout } from './decorators/withMainLayout';

const meta: Meta<typeof SettingsSecretsScreen> = {
  title: 'Screens/Secrets',
  component: SettingsSecretsScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/settings/secrets',
      initialEntry: '/settings/secrets',
    },
    selectedMenuItem: 'secrets',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof SettingsSecretsScreen>;

export const Default: Story = {};
