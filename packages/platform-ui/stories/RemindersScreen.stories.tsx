import type { Meta, StoryObj } from '@storybook/react';
import RemindersScreen, { type Reminder } from '../src/components/screens/RemindersScreen';
import { withMainLayout } from './decorators/withMainLayout';

const meta: Meta<typeof RemindersScreen> = {
  title: 'Screens/Reminders',
  component: RemindersScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof RemindersScreen>;

const sampleReminders: Reminder[] = [
  {
    id: 'rem-1',
    note: 'Follow up on authentication API design',
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    status: 'scheduled',
    threadId: 'thread-1',
  },
  {
    id: 'rem-2',
    note: 'Check container health after deploy',
    scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    status: 'executed',
    runId: 'run-42',
    executedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
];

const countsByStatus = sampleReminders.reduce(
  (acc, reminder) => {
    acc[reminder.status] += 1;
    return acc;
  },
  { scheduled: 0, executed: 0, cancelled: 0 },
);

const baseArgs = {
  reminders: sampleReminders,
  countsByStatus,
  totalCount: sampleReminders.length,
  page: 1,
  pageSize: sampleReminders.length,
  pageCount: 1,
  filter: 'all' as const,
};

export const Default: Story = {
  args: baseArgs,
  parameters: {
    selectedMenuItem: 'reminders',
  },
};
