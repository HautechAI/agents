import type { NodePropertiesViewProps } from '../viewTypes';
import { isRecord } from '../utils';

type MemoryTemplateProps = NodePropertiesViewProps<'Workspace'>;

function MemoryWorkspaceTemplateContent({ config }: MemoryTemplateProps) {
  const configRecord = config as Record<string, unknown>;
  const staticConfig = isRecord(configRecord.staticConfig)
    ? (configRecord.staticConfig as Record<string, unknown>)
    : undefined;

  const scopeValue = typeof staticConfig?.scope === 'string' ? staticConfig.scope : undefined;
  const collectionPrefix =
    typeof staticConfig?.collectionPrefix === 'string' ? staticConfig.collectionPrefix : undefined;
  const title = typeof staticConfig?.title === 'string' ? staticConfig.title : undefined;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-[var(--agyn-dark)] font-semibold">Memory workspace</h3>
        <p className="text-sm text-[var(--agyn-gray)] mt-2">
          This template provisions the shared memory service. Its lifecycle and scope are managed automatically.
        </p>
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)]">
          Static configuration
        </h4>
        {staticConfig ? (
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <div className="text-xs uppercase text-[var(--agyn-gray)]">Scope</div>
              <div className="text-sm text-[var(--agyn-dark)]">{scopeValue ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-[var(--agyn-gray)]">Collection prefix</div>
              <div className="text-sm text-[var(--agyn-dark)]">{collectionPrefix ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-[var(--agyn-gray)]">Display title</div>
              <div className="text-sm text-[var(--agyn-dark)]">{title ?? '—'}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--agyn-gray)] mt-3">
            No static configuration has been provisioned for this memory workspace yet.
          </p>
        )}
      </section>
    </div>
  );
}

export function MemoryWorkspaceTemplateView(props: MemoryTemplateProps) {
  return <MemoryWorkspaceTemplateContent {...props} />;
}

export default MemoryWorkspaceTemplateView;
