import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
// Runtime graph templates provider (distinct from builder TemplatesProvider)
import { TemplatesProvider as RuntimeTemplatesProvider } from './lib/graph/templates.provider';
import { RootLayout } from './layout/RootLayout';
import { GraphScreen } from '@/components/screens/agents/GraphScreen';
import { ChatScreen } from '@/components/screens/agents/ChatScreen';
import { AgentsThreadsScreen } from '@/components/screens/agents/ThreadsScreen';
import { AgentsRemindersScreen } from '@/components/screens/agents/RemindersScreen';
import { AgentsMemoryManagerScreen } from '@/components/screens/agents/MemoryManagerScreen';
import { AgentsRunScreen } from '@/components/screens/agents/RunScreen';
import { TracingTracesScreen } from '@/components/screens/tracing/TracesScreen';
import { TracingErrorsScreen } from '@/components/screens/tracing/ErrorsScreen';
import { TracingDisabledScreen } from '@/components/screens/tracing/TracingDisabledScreen';
import { MonitoringContainersScreen } from '@/components/screens/monitoring/ContainersScreen';
import { MonitoringResourcesScreen } from '@/components/screens/monitoring/ResourcesScreen';
import { SettingsSecretsScreen } from '@/components/screens/settings/SecretsScreen';
import { SettingsVariablesScreen } from '@/components/screens/settings/VariablesScreen';
import { MemoryNodesListScreen } from '@/components/screens/memory/NodesListScreen';
import { MemoryNodeDetailScreen } from '@/components/screens/memory/NodeDetailScreen';
import { OnboardingPage } from '@/components/screens/agents/OnboardingPage';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RuntimeTemplatesProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/agents/graph" replace />} />
          <Route path="/onboarding" element={<OnboardingPage />} />

          {/* Root layout wraps all primary routes */}
          <Route element={<RootLayout />}>
            {/* Agents */}
            <Route path="/agents/graph" element={<GraphScreen />} />
            <Route path="/agents/chat" element={<ChatScreen />} />
            <Route path="/agents/threads" element={<AgentsThreadsScreen />} />
            <Route path="/agents/threads/:threadId" element={<AgentsThreadsScreen />} />
            <Route path="/agents/threads/:threadId/runs/:runId/timeline" element={<AgentsRunScreen />} />
            <Route path="/agents/reminders" element={<AgentsRemindersScreen />} />
            <Route path="/agents/memory" element={<AgentsMemoryManagerScreen />} />

            {/* Tracing */}
            <Route path="/tracing/traces" element={<TracingTracesScreen />} />
            <Route path="/tracing/errors" element={<TracingErrorsScreen />} />
            <Route
              path="/tracing/trace/:traceId"
              element={<TracingDisabledScreen title="Tracing removed" message="Trace details are no longer available." />}
            />
            <Route
              path="/tracing/thread/:threadId"
              element={<TracingDisabledScreen title="Tracing removed" message="Thread trace views are no longer available." />}
            />
            <Route
              path="/tracing/errors/tools/:label"
              element={<TracingDisabledScreen title="Tracing removed" message="Tool error analytics are no longer available." />}
            />

            {/* Monitoring */}
            <Route path="/monitoring/containers" element={<MonitoringContainersScreen />} />
            <Route path="/monitoring/resources" element={<MonitoringResourcesScreen />} />

            {/* Memory */}
            <Route path="/memory" element={<MemoryNodesListScreen />} />
            <Route path="/memory/:nodeId" element={<MemoryNodeDetailScreen />} />

            {/* Settings */}
            <Route path="/settings/secrets" element={<SettingsSecretsScreen />} />
            <Route path="/settings/variables" element={<SettingsVariablesScreen />} />
          </Route>

          <Route path="*" element={<Navigate to="/agents/graph" replace />} />
        </Routes>
      </RuntimeTemplatesProvider>
    </QueryClientProvider>
  );
}

export default App;
