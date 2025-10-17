import { useEffect, useMemo, useState } from 'react';
import type { StaticConfigViewProps } from './types';
import ReferenceField from './shared/ReferenceField';

export default function GithubCloneRepoToolConfigView({ value, onChange, readOnly, disabled }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [token, setToken] = useState<{ value: string; source?: 'static' | 'vault' } | string>((init.token as any) || '');

  useEffect(() => {
    const t = typeof token === 'string' ? { value: token, source: 'static' as const } : (token as any);
    onChange({ ...value, token: t });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="space-y-3 text-sm">
      <ReferenceField
        label="GitHub token (optional)"
        value={token as any}
        onChange={setToken as any}
        readOnly={readOnly}
        disabled={disabled}
        placeholder="token or mount/path/key"
        helpText="When using vault, value should be 'mount/path/key'."
      />
    </div>
  );
}
