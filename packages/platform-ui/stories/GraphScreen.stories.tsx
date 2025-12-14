import type { Meta, StoryObj } from '@storybook/react';
import { GraphScreen } from '@/components/screens/agents/GraphScreen';
import { withMainLayout } from './decorators/withMainLayout';

const meta: Meta<typeof GraphScreen> = {
  title: 'Screens/Graph',
  component: GraphScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/agents/graph',
      initialEntry: '/agents/graph',
    },
    selectedMenuItem: 'graph',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof GraphScreen>;

export const Default: Story = {};
