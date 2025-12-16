import type { Meta, StoryObj } from '@storybook/react';
import VariablesScreen from '@/components/screens/VariablesScreen';
import type { Variable } from '@/components/screens/VariablesScreen';
import { withMainLayout } from './decorators/withMainLayout';

const variables: Variable[] = [
  {
    id: 'var-1',
    key: 'OPS_REGION',
    graphValue: 'iad',
    localValue: 'iad',
  },
  {
    id: 'var-2',
    key: 'OPS_DEFAULT_AGENT',
    graphValue: 'atlas',
    localValue: 'atlas',
  },
  {
    id: 'var-3',
    key: 'OPS_SLACK_CHANNEL',
    graphValue: 'ops-alerts',
    localValue: 'ops-alerts',
  },
];

const meta: Meta<typeof VariablesScreen> = {
  title: 'Screens/Variables',
  component: VariablesScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/settings/variables',
      initialEntry: '/settings/variables',
    },
    selectedMenuItem: 'variables',
  },
  args: {
    variables,
    onCreateVariable: () => undefined,
    onUpdateVariable: () => undefined,
    onDeleteVariable: () => undefined,
    onBack: () => undefined,
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof VariablesScreen>;

export const Default: Story = {};
