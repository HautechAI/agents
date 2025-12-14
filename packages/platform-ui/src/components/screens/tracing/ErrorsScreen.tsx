import { TracingDisabledScreen } from './TracingDisabledScreen';

export function TracingErrorsScreen() {
  return (
    <TracingDisabledScreen title="Tracing removed" message="Trace error analytics are no longer available." />
  );
}
