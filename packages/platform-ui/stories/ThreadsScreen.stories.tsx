import type { Meta, StoryObj } from '@storybook/react';
import { AgentsThreadsScreen } from '@/components/screens/agents/ThreadsScreen';
import { withMainLayout } from './decorators/withMainLayout';

const meta: Meta<typeof AgentsThreadsScreen> = {
  title: 'Screens/Threads',
  component: AgentsThreadsScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/agents/threads',
      initialEntry: '/agents/threads',
    },
    selectedMenuItem: 'threads',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof AgentsThreadsScreen>;

export const ListView: Story = {};

export const ThreadSelected: Story = {
  parameters: {
    screen: {
      routePath: '/agents/threads/:threadId',
      initialEntry: '/agents/threads/thread-demo',
    },
  },
};
