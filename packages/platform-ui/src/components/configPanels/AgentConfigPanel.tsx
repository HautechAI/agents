import { useCallback, useEffect, useMemo, useState } from 'react';

import { Input } from '@/components/Input';
import { MarkdownInput } from '@/components/MarkdownInput';
import { Toggle } from '@/components/Toggle';
import {
  Field,
  NumberField,
  SelectField,
  TextAreaField,
  Section,
} from '@/components/sharedFormFields';
import {
  QUEUE_PROCESS_BUFFER_OPTIONS,
  QUEUE_WHEN_BUSY_OPTIONS,
} from '@/components/nodeProperties/constants';
import {
  applyQueueUpdate,
  applySummarizationUpdate,
  readQueueConfig,
  readSummarizationConfig,
} from '@/components/nodeProperties/utils';
import type {
  AgentQueueConfig,
  AgentSummarizationConfig,
  NodeConfig,
} from '@/components/nodeProperties/types';

import type { ConfigPanelProps } from './types';

function normalizeOptionalString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function AgentConfigPanel({ value, onChange, readOnly, disabled }: ConfigPanelProps) {
  const isDisabled = !!readOnly || !!disabled;
  const agentConfig = useMemo<NodeConfig>(
    () => ({ kind: 'Agent', title: '', ...(value as Record<string, unknown>) } as NodeConfig),
    [value],
  );

  const queueConfig = useMemo(() => readQueueConfig(agentConfig), [agentConfig]);
  const summarization = useMemo(() => readSummarizationConfig(agentConfig), [agentConfig]);

  const nameValue = typeof value.name === 'string' ? (value.name as string) : '';
  const roleValue = typeof value.role === 'string' ? (value.role as string) : '';
  const modelValue = typeof value.model === 'string' ? (value.model as string) : '';
  const systemPromptValue = typeof value.systemPrompt === 'string' ? (value.systemPrompt as string) : '';
  const restrictOutput = value.restrictOutput === true;
  const restrictionMessageValue =
    typeof value.restrictionMessage === 'string' ? (value.restrictionMessage as string) : '';
  const restrictionMaxInjectionsValue =
    typeof value.restrictionMaxInjections === 'number'
      ? (value.restrictionMaxInjections as number)
      : undefined;

  const [nameInput, setNameInput] = useState(nameValue);
  const [roleInput, setRoleInput] = useState(roleValue);

  useEffect(() => {
    setNameInput(nameValue);
  }, [nameValue]);

  useEffect(() => {
    setRoleInput(roleValue);
  }, [roleValue]);

  const handleNameChange = useCallback(
    (next: string) => {
      setNameInput(next);
      onChange({ name: normalizeOptionalString(next) });
    },
    [onChange],
  );

  const handleRoleChange = useCallback(
    (next: string) => {
      setRoleInput(next);
      onChange({ role: normalizeOptionalString(next) });
    },
    [onChange],
  );

  const handleModelChange = useCallback(
    (next: string) => {
      onChange({ model: next.trim() });
    },
    [onChange],
  );

  const handleSystemPromptChange = useCallback(
    (next: string) => {
      onChange({ systemPrompt: next });
    },
    [onChange],
  );

  const handleRestrictionMessageChange = useCallback(
    (next: string) => {
      onChange({ restrictionMessage: normalizeOptionalString(next) });
    },
    [onChange],
  );

  const handleRestrictionMaxInjectionsChange = useCallback(
    (next: number | undefined) => {
      onChange({ restrictionMaxInjections: next });
    },
    [onChange],
  );

  const handleQueueUpdate = useCallback(
    (partial: Partial<AgentQueueConfig>) => {
      onChange(applyQueueUpdate(agentConfig, partial));
    },
    [agentConfig, onChange],
  );

  const handleSummarizationUpdate = useCallback(
    (partial: Partial<AgentSummarizationConfig>) => {
      onChange(applySummarizationUpdate(agentConfig, partial));
    },
    [agentConfig, onChange],
  );

  return (
    <div className="space-y-8 text-sm">
      <Section title="Profile">
        <Field label="Name" hint="Optional display name">
          <Input
            placeholder="e.g., Casey Quinn"
            value={nameInput}
            onChange={(event) => handleNameChange(event.target.value)}
            size="sm"
            maxLength={64}
            disabled={isDisabled}
          />
        </Field>
        <Field label="Role" hint="Optional role or specialty">
          <Input
            placeholder="e.g., Incident Commander"
            value={roleInput}
            onChange={(event) => handleRoleChange(event.target.value)}
            size="sm"
            maxLength={64}
            disabled={isDisabled}
          />
        </Field>
      </Section>

      <Section title="LLM">
        <Field
          label="Model"
          hint="The LLM model identifier (e.g., gpt-4, claude-3-opus)"
          required
        >
          <Input
            placeholder="gpt-4"
            value={modelValue}
            onChange={(event) => handleModelChange(event.target.value)}
            size="sm"
            disabled={isDisabled}
          />
        </Field>
        <Field
          label="System Prompt"
          hint="Initial instructions that define the agent's behavior"
        >
          <MarkdownInput
            rows={3}
            placeholder="You are a helpful assistant..."
            value={systemPromptValue}
            onChange={(event) => handleSystemPromptChange(event.target.value)}
            size="sm"
            disabled={isDisabled}
          />
        </Field>
      </Section>

      <Section title="Finish Restriction">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium text-[var(--agyn-dark)]">Block premature finish</div>
            <div className="text-xs text-muted-foreground">
              Require at least one tool call before finishing.
            </div>
          </div>
          <Toggle
            label=""
            description=""
            checked={restrictOutput}
            onCheckedChange={(checked) => onChange({ restrictOutput: checked })}
            disabled={isDisabled}
          />
        </div>
        {restrictOutput ? (
          <div className="space-y-4 border-l-2 border-[var(--agyn-border-default)] pl-4">
            <TextAreaField
              label="Restriction Message"
              hint="Message shown when the agent tries to finish without calling required tools"
              value={restrictionMessageValue}
              onChange={handleRestrictionMessageChange}
              rows={2}
              disabled={isDisabled}
            />
            <NumberField
              label="Max Injections"
              hint="Maximum number of times the restriction message can be injected"
              value={restrictionMaxInjectionsValue}
              onChange={handleRestrictionMaxInjectionsChange}
              min={0}
              step={1}
              disabled={isDisabled}
            />
          </div>
        ) : null}
      </Section>

      <Section title="Messages Queue">
        <NumberField
          label="Debounce (ms)"
          hint="Wait time in milliseconds before processing new messages"
          value={queueConfig.debounceMs}
          onChange={(next) => handleQueueUpdate({ debounceMs: next })}
          min={0}
          step={100}
          disabled={isDisabled}
        />
        <SelectField
          label="When Busy"
          hint="Behavior when a new message arrives while agent is processing"
          value={queueConfig.whenBusy ?? 'wait'}
          onChange={(next) => handleQueueUpdate({ whenBusy: next as AgentQueueConfig['whenBusy'] })}
          options={QUEUE_WHEN_BUSY_OPTIONS}
          disabled={isDisabled}
        />
        <SelectField
          label="Process Buffer"
          hint="How to process multiple queued messages"
          value={queueConfig.processBuffer ?? 'allTogether'}
          onChange={(next) =>
            handleQueueUpdate({ processBuffer: next as AgentQueueConfig['processBuffer'] })
          }
          options={QUEUE_PROCESS_BUFFER_OPTIONS}
          disabled={isDisabled}
        />
      </Section>

      <Section title="Summarization">
        <NumberField
          label="Keep Tokens"
          hint="Tokens preserved from the beginning of the thread"
          value={summarization.keepTokens}
          onChange={(next) => handleSummarizationUpdate({ keepTokens: next })}
          min={0}
          step={1}
          disabled={isDisabled}
        />
        <NumberField
          label="Max Tokens"
          hint="Maximum tokens kept when summarizing the thread"
          value={summarization.maxTokens}
          onChange={(next) => handleSummarizationUpdate({ maxTokens: next })}
          min={0}
          step={1}
          disabled={isDisabled}
        />
        <TextAreaField
          label="Summarization Prompt"
          hint="Optional custom prompt used during summarization"
          value={summarization.prompt}
          onChange={(next) => handleSummarizationUpdate({ prompt: normalizeOptionalString(next) })}
          rows={2}
          disabled={isDisabled}
        />
      </Section>
    </div>
  );
}
