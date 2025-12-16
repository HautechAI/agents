import type { Meta, StoryObj } from '@storybook/react';
import SecretsScreen from '@/components/screens/SecretsScreen';
import type { Secret } from '@/components/screens/SecretsScreen';
import { withMainLayout } from './decorators/withMainLayout';

const secrets: Secret[] = [
  {
    id: 'secret-1',
    key: 'OPS_SLACK_WEBHOOK',
    value: 'https://hooks.slack.com/XXX',
    status: 'used',
  },
  {
    id: 'secret-2',
    key: 'OPS_DB_PASSWORD',
    value: 'super-secret',
    status: 'missing',
  },
];

const meta: Meta<typeof SecretsScreen> = {
  title: 'Screens/Secrets',
  component: SecretsScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/settings/secrets',
      initialEntry: '/settings/secrets',
    },
    selectedMenuItem: 'secrets',
  },
  args: {
    secrets,
    onCreateSecret: () => undefined,
    onUpdateSecret: () => undefined,
    onDeleteSecret: () => undefined,
    onBack: () => undefined,
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof SecretsScreen>;

export const Default: Story = {};
