import type { Meta, StoryObj } from '@storybook/react';
import { AgentsRemindersScreen } from '@/components/screens/agents/RemindersScreen';
import { withMainLayout } from './decorators/withMainLayout';

const meta: Meta<typeof AgentsRemindersScreen> = {
  title: 'Screens/Reminders',
  component: AgentsRemindersScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/agents/reminders',
      initialEntry: '/agents/reminders',
    },
    selectedMenuItem: 'reminders',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof AgentsRemindersScreen>;

export const Default: Story = {};
