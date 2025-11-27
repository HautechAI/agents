import type { Meta, StoryObj } from '@storybook/react';
import EmptySelectionSidebar from '../src/components/EmptySelectionSidebar';

const sampleItems = [
  {
    id: 'trigger-http',
    kind: 'Trigger',
    title: 'HTTP Trigger',
    description: 'Start a workflow with an HTTP request',
  },
  {
    id: 'agent-gpt4',
    kind: 'Agent',
    title: 'GPT-4 Agent',
    description: 'AI agent powered by GPT-4',
  },
  {
    id: 'tool-search',
    kind: 'Tool',
    title: 'Web Search',
    description: 'Search the web for information',
  },
];

const meta: Meta<typeof EmptySelectionSidebar> = {
  title: 'Screens/Graph/EmptySelectionSidebar',
  component: EmptySelectionSidebar,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof EmptySelectionSidebar>;

export const Default: Story = {
  render: (args) => (
    <div className="h-screen flex">
      <div className="flex-1 bg-[var(--agyn-bg-light)]" />
      <EmptySelectionSidebar {...args} />
    </div>
  ),
  args: {
    nodeItems: sampleItems,
  },
};

export const CustomNodeItems: Story = {
  render: (args) => (
    <div className="h-screen flex">
      <div className="flex-1 bg-[var(--agyn-bg-light)]" />
      <EmptySelectionSidebar {...args} />
    </div>
  ),
  args: {
    nodeItems: [
      {
        id: 'agent-custom',
        kind: 'Agent',
        title: 'Custom GPT Agent',
        description: 'A customized GPT agent with specific instructions',
      },
      {
        id: 'tool-custom',
        kind: 'Tool',
        title: 'API Integration',
        description: 'Connect to external APIs and services',
      },
      {
        id: 'trigger-webhook',
        kind: 'Trigger',
        title: 'Webhook Trigger',
        description: 'Trigger workflow via webhook',
      },
    ],
  },
};

export const LoadingState: Story = {
  render: (args) => (
    <div className="h-screen flex">
      <div className="flex-1 bg-[var(--agyn-bg-light)]" />
      <EmptySelectionSidebar {...args} />
    </div>
  ),
  args: {
    nodeItems: [],
    isLoading: true,
  },
};

export const ErrorState: Story = {
  render: (args) => (
    <div className="h-screen flex">
      <div className="flex-1 bg-[var(--agyn-bg-light)]" />
      <EmptySelectionSidebar {...args} />
    </div>
  ),
  args: {
    nodeItems: sampleItems,
    errorMessage: 'Failed to load templates',
  },
};

export const EmptyState: Story = {
  render: (args) => (
    <div className="h-screen flex">
      <div className="flex-1 bg-[var(--agyn-bg-light)]" />
      <EmptySelectionSidebar {...args} />
    </div>
  ),
  args: {
    nodeItems: [],
  },
};
