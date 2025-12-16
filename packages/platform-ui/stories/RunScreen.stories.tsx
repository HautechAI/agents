import type { Meta, StoryObj } from '@storybook/react';
import RunScreen from '@/components/screens/RunScreen';
import type { RunEvent } from '@/components/RunEventsList';
import { withMainLayout } from './decorators/withMainLayout';

const events: RunEvent[] = [
  {
    id: 'evt-alpha-1',
    type: 'message',
    status: 'success',
    timestamp: '2024-11-05T09:12:05Z',
    duration: 'instant',
    icon: 'message',
    title: 'User message',
    description: 'Please audit slow queries on billing tables.',
    tokens: { input: 0, output: 0, total: 0 },
  },
  {
    id: 'evt-alpha-2',
    type: 'llm',
    status: 'success',
    timestamp: '2024-11-05T09:12:45Z',
    duration: '5s',
    icon: 'llm',
    title: 'gpt-4o-mini',
    description: 'Identified missing composite index.',
    tokens: { input: 1800, output: 360, total: 2360 },
  },
  {
    id: 'evt-alpha-3',
    type: 'tool',
    status: 'success',
    timestamp: '2024-11-05T09:13:20Z',
    duration: '10s',
    icon: 'tool',
    title: 'grafana.panel',
    description: 'Fetched Grafana dashboard screenshot.',
    tokens: { input: 0, output: 0, total: 0 },
  },
];

const meta: Meta<typeof RunScreen> = {
  title: 'Screens/Run',
  component: RunScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/agents/threads/:threadId/runs/:runId/timeline',
      initialEntry: '/agents/threads/thread-alpha/runs/run-alpha-1/timeline',
    },
    selectedMenuItem: 'threads',
  },
  args: {
    runId: 'run-alpha-1',
    status: 'finished',
    createdAt: '2024-11-05T09:12:00Z',
    duration: '3m 15s',
    statistics: {
      totalEvents: events.length,
      messages: 1,
      llm: 1,
      tools: 1,
      summaries: 0,
    },
    tokens: {
      input: 1800,
      cached: 200,
      output: 360,
      reasoning: 0,
      total: 2360,
    },
    events,
    selectedEventId: events[1].id,
    isFollowing: true,
    eventFilters: ['message', 'llm', 'tool', 'summary'],
    statusFilters: ['running', 'finished'],
    tokensPopoverOpen: false,
    runsPopoverOpen: false,
    hasMoreEvents: false,
    isLoadingMoreEvents: false,
    isLoading: false,
    isEmpty: false,
    onSelectEvent: () => undefined,
    onFollowingChange: () => undefined,
    onEventFiltersChange: () => undefined,
    onStatusFiltersChange: () => undefined,
    onTokensPopoverOpenChange: () => undefined,
    onRunsPopoverOpenChange: () => undefined,
    onLoadMoreEvents: () => undefined,
    onTerminate: () => undefined,
    onBack: () => undefined,
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof RunScreen>;

export const Default: Story = {};
