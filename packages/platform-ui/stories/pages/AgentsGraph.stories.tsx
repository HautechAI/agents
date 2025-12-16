import type { Meta, StoryObj } from '@storybook/react';
import { AgentsGraphContainer } from '@/features/graph/containers/AgentsGraphContainer';
import { pageHandlers } from '../../.storybook/msw-handlers';
import { withMainLayout } from '../decorators/withMainLayout';

const meta: Meta<typeof AgentsGraphContainer> = {
  title: 'Pages/AgentsGraph',
  component: AgentsGraphContainer,
  decorators: [withMainLayout],
  tags: ['!autodocs'],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/agents/graph',
      initialEntry: '/agents/graph',
    },
    selectedMenuItem: 'graph',
  },
};

export default meta;

type Story = StoryObj<typeof AgentsGraphContainer>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: pageHandlers,
    },
  },
};
