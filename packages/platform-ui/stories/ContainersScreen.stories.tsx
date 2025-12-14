import type { Meta, StoryObj } from '@storybook/react';
import { MonitoringContainersScreen } from '@/components/screens/monitoring/ContainersScreen';
import { withMainLayout } from './decorators/withMainLayout';

const meta: Meta<typeof MonitoringContainersScreen> = {
  title: 'Screens/Containers',
  component: MonitoringContainersScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/monitoring/containers',
      initialEntry: '/monitoring/containers',
    },
    selectedMenuItem: 'containers',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof MonitoringContainersScreen>;

export const Default: Story = {};
