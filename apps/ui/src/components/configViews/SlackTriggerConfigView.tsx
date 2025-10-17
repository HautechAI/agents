import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';
import ReferenceField from './shared/ReferenceField';

export default function SlackTriggerConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [app_token, setAppToken] = useState<{ value: string; source?: 'static' | 'vault' } | string>((init.app_token as any) || '');
  const [bot_token, setBotToken] = useState<{ value: string; source?: 'static' | 'vault' } | string>((init.bot_token as any) || '');
  const [default_channel, setDefaultChannel] = useState<string>((init.default_channel as string) || '');
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    const errors: string[] = [];
    if (!app_token) errors.push('app_token is required');
    if (!bot_token) errors.push('bot_token is required');
    onValidate?.(errors);
  }, [app_token, bot_token, onValidate]);

  useEffect(() => {
    const at = typeof app_token === 'string' ? { value: app_token, source: 'static' as const } : (app_token as any);
    const bt = typeof bot_token === 'string' ? { value: bot_token, source: 'static' as const } : (bot_token as any);
    onChange({ ...value, app_token: at, bot_token: bt, default_channel });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app_token, bot_token, default_channel]);

  return (
    <div className="space-y-3 text-sm">
      <ReferenceField
        label="App token"
        value={app_token as any}
        onChange={setAppToken as any}
        readOnly={readOnly}
        disabled={disabled}
        placeholder="xapp-... or mount/path/key"
        helpText="Use source=vault to reference a secret as mount/path/key."
      />
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
        <Input value={default_channel} onChange={(e) => setDefaultChannel(e.target.value)} disabled={isDisabled} placeholder="#general or C123" />
      </div>
    </div>
  );
}
