import type { Meta, StoryObj } from '@storybook/react';
import { AgentsRunScreen } from '@/components/screens/agents/RunScreen';
import { withMainLayout } from './decorators/withMainLayout';

const meta: Meta<typeof AgentsRunScreen> = {
  title: 'Screens/Run',
  component: AgentsRunScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/agents/threads/:threadId/runs/:runId/timeline',
      initialEntry: '/agents/threads/thread-demo/runs/run-demo/timeline',
    },
    selectedMenuItem: 'threads',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof AgentsRunScreen>;

export const Default: Story = {};
