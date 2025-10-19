import { ObsUiProvider, TracingTracesView } from '@agyn/obs-ui';

const serverUrl = import.meta.env.VITE_OBS_SERVER_URL as string;

export function TracingTraces() {
  return (
    <div className="p-4">
      <ObsUiProvider serverUrl={serverUrl}>
        <TracingTracesView basePaths={{ trace: '/tracing/trace', thread: '/tracing/thread', errorsTools: '/tracing/errors/tools', toolErrors: '/tracing/errors/tools' }} />
      </ObsUiProvider>
    </div>
  );
}
