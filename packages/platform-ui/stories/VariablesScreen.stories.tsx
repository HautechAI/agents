import type { Meta, StoryObj } from '@storybook/react';
import { SettingsVariablesScreen } from '@/components/screens/settings/VariablesScreen';
import { withMainLayout } from './decorators/withMainLayout';

const meta: Meta<typeof SettingsVariablesScreen> = {
  title: 'Screens/Variables',
  component: SettingsVariablesScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/settings/variables',
      initialEntry: '/settings/variables',
    },
    selectedMenuItem: 'variables',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof SettingsVariablesScreen>;

export const Default: Story = {};
