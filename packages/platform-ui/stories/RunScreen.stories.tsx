import { useArgs } from 'storybook/preview-api';
import { action } from 'storybook/actions';
import type { Meta, StoryObj } from '@storybook/react';
import { rest } from 'msw';
import RunScreen from '../src/components/screens/RunScreen';
import type { RunEvent } from '../src/components/RunEventsList';
import type { EventType } from '../src/components/RunEventDetails';
import type { ContextItem } from '../src/api/types/agents';
import { type Status } from '../src/components/StatusIndicator';
import { withMainLayout } from './decorators/withMainLayout';
import { withQueryClient } from './decorators/withQueryClient';

type RunScreenProps = React.ComponentProps<typeof RunScreen>;

const meta: Meta<typeof RunScreen> = {
  title: 'Screens/Run',
  component: RunScreen,
  decorators: [withQueryClient, withMainLayout],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof RunScreen>;

const sampleContextItems: ContextItem[] = [
  {
    id: 'ctx-1',
    role: 'user',
    contentText: 'Can you help me implement a secure authentication system?',
    contentJson: null,
    metadata: {},
    sizeBytes: 220,
    createdAt: '2024-07-10T19:34:00.000Z',
  },
  {
    id: 'ctx-2',
    role: 'assistant',
    contentText: null,
    contentJson: {
      plan: ['Outline requirements', 'Draft implementation', 'Review tests'],
    },
    metadata: {},
    sizeBytes: 512,
    createdAt: '2024-07-10T19:34:08.000Z',
  },
  {
    id: 'ctx-3',
    role: 'tool',
    contentText: null,
    contentJson: {
      command: 'npm install jsonwebtoken',
      result: 'added 12 packages',
    },
    metadata: {},
    sizeBytes: 640,
    createdAt: '2024-07-10T19:34:12.500Z',
  },
];

const sampleContextItemMap = new Map(sampleContextItems.map((item) => [item.id, item]));

const sampleEvents: RunEvent[] = [
  {
    id: 'evt-1',
    type: 'message' as EventType,
    timestamp: '2024-07-10T19:34:12.000Z',
    startedAt: '2024-07-10T19:34:12.000Z',
    endedAt: null,
    durationMs: null,
    status: 'finished',
    data: {
      messageSubtype: 'source',
      content:
        'Can you help me implement a user authentication system with JWT tokens and OAuth 2.0 integration?',
    },
  },
  {
    id: 'evt-2',
    type: 'llm' as EventType,
    timestamp: '2024-07-10T19:34:15.000Z',
    startedAt: '2024-07-10T19:34:13.000Z',
    endedAt: '2024-07-10T19:34:15.300Z',
    durationMs: 2300,
    status: 'finished',
    data: {
      context: ['ctx-1', 'ctx-2', 'ctx-3'],
      newContextCount: 1,
      response:
        "I'll help you implement a comprehensive authentication system. Let me break this down into steps and create the necessary files.",
      model: 'gpt-4-turbo',
      tokens: {
        input: 1234,
        cached: 120,
        output: 856,
        reasoning: 64,
        total: 2274,
      },
      cost: '$0.0234',
    },
  },
  {
    id: 'evt-3',
    type: 'tool' as EventType,
    timestamp: '2024-07-10T19:34:17.000Z',
    startedAt: '2024-07-10T19:34:16.000Z',
    endedAt: '2024-07-10T19:34:17.200Z',
    durationMs: 1200,
    status: 'finished',
    data: {
      toolName: 'file_write',
      toolSubtype: 'generic',
      input: {
        path: '/src/auth/jwt.ts',
        content:
          'import jwt from "jsonwebtoken";\n\nexport function generateToken(payload: any) {\n  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });\n}',
      },
      output: {
        success: true,
        path: '/src/auth/jwt.ts',
        bytesWritten: 234,
      },
    },
  },
  {
    id: 'evt-4',
    type: 'tool' as EventType,
    timestamp: '2024-07-10T19:34:19.200Z',
    startedAt: '2024-07-10T19:34:18.400Z',
    endedAt: '2024-07-10T19:34:19.200Z',
    durationMs: 800,
    status: 'finished',
    data: {
      toolName: 'shell',
      toolSubtype: 'shell',
      command: 'npm install jsonwebtoken bcrypt express-session passport passport-jwt',
      output:
        'added 12 packages, and audited 200 packages in 2s\n\nfound 0 vulnerabilities',
      exitCode: 0,
      workingDir: '/home/user/project',
    },
  },
  {
    id: 'evt-4a',
    type: 'tool' as EventType,
    timestamp: '2024-07-10T19:34:21.500Z',
    startedAt: '2024-07-10T19:34:18.000Z',
    endedAt: '2024-07-10T19:34:21.500Z',
    durationMs: 3500,
    status: 'finished',
    data: {
      toolName: 'manage',
      toolSubtype: 'manage',
      input: {
        command: 'send_message',
        worker: 'agent-ops',
        message:
          'Deploy the updated authentication service to staging environment and run integration tests.',
        threadAlias: 'deploy-auth-staging',
      },
      output: {
        success: true,
        subthreadId: 'thread-abc-123',
        runId: 'run-xyz-456',
        message: 'Message sent to worker agent-ops in thread deploy-auth-staging',
      },
    },
  },
  {
    id: 'evt-5',
    type: 'summarization' as EventType,
    timestamp: '2024-07-10T19:34:38.000Z',
    startedAt: '2024-07-10T19:34:36.500Z',
    endedAt: '2024-07-10T19:34:38.300Z',
    durationMs: 1800,
    status: 'finished',
    data: {
      summary:
        'Implemented JWT-based authentication with OAuth 2.0 integration, added security best practices, and identified one failing test related to empty JWT_SECRET handling.',
      newContext: ['Resolved configuration drift', 'Updated deployment checklist'],
      oldContext: [],
      newContextCount: 2,
    },
  },
  {
    id: 'evt-6',
    type: 'message' as EventType,
    timestamp: '2024-07-10T19:34:45.000Z',
    startedAt: '2024-07-10T19:34:45.000Z',
    endedAt: null,
    durationMs: null,
    status: 'finished',
    data: {
      messageSubtype: 'result',
      content:
        'Authentication system implementation complete! All tests passing. JWT token generation, OAuth 2.0 providers, and security best practices are in place.',
    },
  },
];

const contextItemsHandler = rest.get('/api/agents/context-items', (req, res, ctx) => {
  const ids = req.url.searchParams.getAll('ids');
  const source = ids.length > 0 ? ids : Array.from(sampleContextItemMap.keys());
  const items = source
    .map((id) => sampleContextItemMap.get(id))
    .filter((item): item is ContextItem => Boolean(item));
  return res(ctx.json({ items }));
});

const ControlledRender: Story['render'] = () => {
  const [currentArgs, updateArgs] = useArgs<RunScreenProps>();
  const logSelectEvent = action('onSelectEvent');
  const logFollowingChange = action('onFollowingChange');
  const logEventFiltersChange = action('onEventFiltersChange');
  const logStatusFiltersChange = action('onStatusFiltersChange');
  const logTokensPopoverOpenChange = action('onTokensPopoverOpenChange');
  const logRunsPopoverOpenChange = action('onRunsPopoverOpenChange');
  const logLoadMoreEvents = action('onLoadMoreEvents');
  const logTerminate = action('onTerminate');
  const logBack = action('onBack');

  return (
    <RunScreen
      {...currentArgs}
      onSelectEvent={(eventId) => {
        logSelectEvent(eventId);
        updateArgs({ selectedEventId: eventId });
      }}
      onFollowingChange={(follow) => {
        logFollowingChange(follow);
        updateArgs({ isFollowing: follow });
      }}
      onEventFiltersChange={(filters) => {
        logEventFiltersChange(filters);
        updateArgs({ eventFilters: filters });
      }}
      onStatusFiltersChange={(filters) => {
        logStatusFiltersChange(filters);
        updateArgs({ statusFilters: filters });
      }}
      onTokensPopoverOpenChange={(open) => {
        logTokensPopoverOpenChange(open);
        updateArgs({ tokensPopoverOpen: open });
      }}
      onRunsPopoverOpenChange={(open) => {
        logRunsPopoverOpenChange(open);
        updateArgs({ runsPopoverOpen: open });
      }}
      onLoadMoreEvents={() => {
        logLoadMoreEvents();
      }}
      onTerminate={() => {
        logTerminate();
      }}
      onBack={() => {
        logBack();
      }}
      onClearSelection={() => {
        updateArgs({ selectedEventId: null });
      }}
    />
  );
};

const baseStatistics = {
  totalEvents: sampleEvents.length,
  messages: 2,
  llm: 1,
  tools: 3,
  summaries: 1,
};

const baseTokens = {
  input: 500,
  cached: 0,
  output: 300,
  reasoning: 0,
  total: 800,
};

export const Populated: Story = {
  args: {
    runId: 'run-001',
    status: 'running' as Status,
    createdAt: new Date().toISOString(),
    duration: '2m 45s',
    statistics: baseStatistics,
    tokens: baseTokens,
    events: sampleEvents,
    selectedEventId: sampleEvents[0].id,
    isFollowing: true,
    eventFilters: [],
    statusFilters: [],
    tokensPopoverOpen: false,
    runsPopoverOpen: false,
    hasMoreEvents: true,
    isLoadingMoreEvents: false,
    isLoading: false,
    isEmpty: false,
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
    msw: {
      handlers: [contextItemsHandler],
    },
  },
};

export const Empty: Story = {
  args: {
    runId: 'run-002',
    status: 'finished' as Status,
    createdAt: new Date().toISOString(),
    duration: '0s',
    statistics: {
      totalEvents: 0,
      messages: 0,
      llm: 0,
      tools: 0,
      summaries: 0,
    },
    tokens: baseTokens,
    events: [],
    selectedEventId: null,
    isFollowing: false,
    eventFilters: [],
    statusFilters: [],
    tokensPopoverOpen: false,
    runsPopoverOpen: false,
    hasMoreEvents: false,
    isLoadingMoreEvents: false,
    isLoading: false,
    isEmpty: true,
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
    msw: {
      handlers: [contextItemsHandler],
    },
  },
};

export const Loading: Story = {
  args: {
    runId: 'run-003',
    status: 'running' as Status,
    createdAt: new Date().toISOString(),
    duration: '—',
    statistics: baseStatistics,
    tokens: baseTokens,
    events: sampleEvents,
    selectedEventId: sampleEvents[0].id,
    isFollowing: true,
    eventFilters: [],
    statusFilters: [],
    tokensPopoverOpen: false,
    runsPopoverOpen: false,
    hasMoreEvents: true,
    isLoadingMoreEvents: true,
    isLoading: true,
    isEmpty: false,
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
    msw: {
      handlers: [contextItemsHandler],
    },
  },
};

export const Error: Story = {
  args: {
    runId: 'run-004',
    status: 'failed' as Status,
    createdAt: new Date().toISOString(),
    duration: '1m 12s',
    statistics: baseStatistics,
    tokens: baseTokens,
    events: sampleEvents,
    selectedEventId: sampleEvents[0].id,
    isFollowing: false,
    eventFilters: [],
    statusFilters: [],
    tokensPopoverOpen: false,
    runsPopoverOpen: false,
    hasMoreEvents: false,
    isLoadingMoreEvents: false,
    isLoading: false,
    isEmpty: false,
    error: 'Unable to load this run. Please retry.',
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
    msw: {
      handlers: [contextItemsHandler],
    },
  },
};
