import { ObsUiProvider, TracingErrorsView } from '@agyn/obs-ui';

const serverUrl = import.meta.env.VITE_OBS_SERVER_URL as string;

export function TracingErrors() {
  return (
    <div className="p-4">
      <ObsUiProvider serverUrl={serverUrl}>
        <TracingErrorsView basePaths={{ errorsTools: '/tracing/errors/tools', toolErrors: '/tracing/errors/tools' }} />
      </ObsUiProvider>
    </div>
  );
}
