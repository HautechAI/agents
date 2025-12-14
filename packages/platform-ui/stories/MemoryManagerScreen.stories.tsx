import type { Meta, StoryObj } from '@storybook/react';
import { AgentsMemoryManagerScreen } from '@/components/screens/agents/MemoryManagerScreen';
import { withMainLayout } from './decorators/withMainLayout';

const meta: Meta<typeof AgentsMemoryManagerScreen> = {
  title: 'Screens/MemoryManager',
  component: AgentsMemoryManagerScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/agents/memory',
      initialEntry: '/agents/memory',
    },
    selectedMenuItem: 'memory',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof AgentsMemoryManagerScreen>;

export const Default: Story = {};
