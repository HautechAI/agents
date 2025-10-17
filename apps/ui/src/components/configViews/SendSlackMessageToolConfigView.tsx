import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';
import ReferenceField from './shared/ReferenceField';

export default function SendSlackMessageToolConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [default_channel, setDefaultChannel] = useState<string>((init.default_channel as string) || '');
  const [bot_token, setBotToken] = useState<{ value: string; source?: 'static' | 'vault' } | string>((init.bot_token as any) || '');
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    const errors: string[] = [];
    if (!bot_token) errors.push('bot_token is required');
    onValidate?.(errors);
  }, [bot_token, onValidate]);

  useEffect(() => {
    const token = typeof bot_token === 'string' ? { value: bot_token, source: 'static' as const } : (bot_token as any);
    onChange({ ...value, bot_token: token, default_channel });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot_token, default_channel]);

  return (
    <div className="space-y-3 text-sm">
      <ReferenceField
        label="Bot token"
        value={bot_token as any}
        onChange={setBotToken as any}
        readOnly={readOnly}
        disabled={disabled}
        placeholder="xoxb-... or mount/path/key"
        helpText="Use source=vault to reference a secret as mount/path/key."
      />
      <div>
        <label className="block text-xs mb-1">Default channel</label>
        <Input value={default_channel} onChange={(e) => setDefaultChannel(e.target.value)} disabled={isDisabled} placeholder="C123 or #general" />
      </div>
    </div>
  );
}
