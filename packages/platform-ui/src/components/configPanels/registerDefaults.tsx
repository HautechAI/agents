import { installDefaultConfigViews } from '../configViews/registerDefaults';
import type {
  DynamicConfigViewComponent,
  StaticConfigViewComponent,
} from '../configViews/types';

import { registerConfigPanel, clearConfigPanelRegistry } from './registry';
import type { ConfigPanelComponent } from './types';
import { AgentConfigPanel } from './AgentConfigPanel';
import { ManageToolConfigPanel } from './ManageToolConfigPanel';
import { MemoryToolConfigPanel } from './MemoryToolConfigPanel';
import { ToolNamePanel } from './ToolNamePanel';

function adaptStaticView(View: StaticConfigViewComponent): ConfigPanelComponent {
  const StaticPanel: ConfigPanelComponent = ({
    template,
    value,
    onChange,
    readOnly,
    disabled,
    onValidate,
  }) => (
    <View
      templateName={template}
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      disabled={disabled}
      onValidate={onValidate}
    />
  );
  StaticPanel.displayName = `ConfigPanel(${View.displayName ?? View.name ?? 'Static'})`;
  return StaticPanel;
}

function adaptDynamicView(View: DynamicConfigViewComponent): ConfigPanelComponent {
  const DynamicPanel: ConfigPanelComponent = ({
    template,
    value,
    onChange,
    readOnly,
    disabled,
    nodeId,
  }) => {
    if (!nodeId) {
      return <div className="text-xs text-muted-foreground">Dynamic configuration unavailable.</div>;
    }
    return (
      <View
        nodeId={nodeId}
        templateName={template}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        disabled={disabled}
      />
    );
  };
  DynamicPanel.displayName = `ConfigPanel(${View.displayName ?? View.name ?? 'Dynamic'})`;
  return DynamicPanel;
}

let installed = false;

export function installDefaultConfigPanels() {
  if (installed) return;
  installed = true;

  installDefaultConfigViews((entry) => {
    if (entry.mode === 'static') {
      registerConfigPanel({
        template: entry.template,
        mode: 'static',
        component: adaptStaticView(entry.component as StaticConfigViewComponent),
      });
      return;
    }
    if (entry.mode === 'dynamic') {
      registerConfigPanel({
        template: entry.template,
        mode: 'dynamic',
        component: adaptDynamicView(entry.component as DynamicConfigViewComponent),
      });
    }
  });

  registerConfigPanel({
    template: 'agent',
    mode: 'static',
    component: AgentConfigPanel,
    priority: 20,
  });

  registerConfigPanel({
    template: 'manageTool',
    mode: 'static',
    component: ManageToolConfigPanel,
    priority: 20,
  });

  registerConfigPanel({
    template: 'memoryTool',
    mode: 'static',
    component: MemoryToolConfigPanel,
    priority: 20,
  });

  ['sendMessageTool', 'finishTool', 'remindMeTool', 'debugTool'].forEach((template) => {
    registerConfigPanel({
      template,
      mode: 'static',
      component: ToolNamePanel,
      priority: 15,
    });
  });
}

export function resetDefaultConfigPanelsForTests() {
  clearConfigPanelRegistry();
  installed = false;
}
