import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Screen,
  ScreenActions,
  ScreenBody,
  ScreenContent,
  ScreenDescription,
  ScreenHeader,
  ScreenHeaderContent,
  ScreenTabs,
  ScreenTitle,
} from '@/components/ui/screen';
import { TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CredentialsTab } from '@/features/llmSettings/components/CredentialsTab';
import { ModelsTab } from '@/features/llmSettings/components/ModelsTab';
import type { CredentialRecord, ModelRecord, ProviderOption } from '@/features/llmSettings/types';

type TabValue = 'credentials' | 'models';

type Banner = {
  title: string;
  description: ReactNode;
};

type LlmSettingsScreenProps = {
  activeTab: TabValue;
  onTabChange?: (tab: TabValue) => void;
  credentials: CredentialRecord[];
  models: ModelRecord[];
  providers: ProviderOption[];
  readOnly?: boolean;
  canCreateModel?: boolean;
  loadingCredentials?: boolean;
  loadingModels?: boolean;
  credentialsError?: string | null;
  modelsError?: string | null;
  showProviderWarning?: boolean;
  adminBanner?: Banner | null;
  onCredentialCreate?: () => void;
  onCredentialEdit?: (credential: CredentialRecord) => void;
  onCredentialTest?: (credential: CredentialRecord) => void;
  onCredentialDelete?: (credential: CredentialRecord) => void;
  onModelCreate?: () => void;
  onModelEdit?: (model: ModelRecord) => void;
  onModelTest?: (model: ModelRecord) => void;
  onModelDelete?: (model: ModelRecord) => void;
};

export function LlmSettingsScreen({
  activeTab,
  onTabChange,
  credentials,
  models,
  providers,
  readOnly = false,
  canCreateModel = true,
  loadingCredentials = false,
  loadingModels = false,
  credentialsError = null,
  modelsError = null,
  showProviderWarning = true,
  adminBanner = null,
  onCredentialCreate,
  onCredentialEdit,
  onCredentialTest,
  onCredentialDelete,
  onModelCreate,
  onModelEdit,
  onModelTest,
  onModelDelete,
}: LlmSettingsScreenProps) {
  const handleTabChange = (value: string) => {
    if (value === activeTab) return;
    onTabChange?.(value as TabValue);
  };

  const showProviderNotice = showProviderWarning && !adminBanner;

  const primaryAction =
    activeTab === 'credentials'
      ? {
          label: 'Add Credential',
          disabled: readOnly || providers.length === 0,
          handler: onCredentialCreate,
        }
      : {
          label: 'Add Model',
          disabled: readOnly || !canCreateModel,
          handler: onModelCreate,
        };

  const showPrimaryAction = Boolean(primaryAction.handler);

  return (
    <Screen className="bg-background">
      <ScreenHeader className="border-b border-border/60 bg-background">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <ScreenHeaderContent className="gap-2">
            <ScreenTitle>LLM Settings</ScreenTitle>
            <ScreenDescription>
              Administer LiteLLM credentials and models used across agents and workflows.
            </ScreenDescription>
          </ScreenHeaderContent>
          {showPrimaryAction ? (
            <ScreenActions>
              <Button onClick={() => primaryAction.handler?.()} disabled={primaryAction.disabled}>
                {primaryAction.label}
              </Button>
            </ScreenActions>
          ) : null}
        </div>
      </ScreenHeader>

      <ScreenTabs
        className="flex h-full flex-col gap-0"
        value={activeTab}
        onValueChange={handleTabChange}
      >
        <div className="border-b border-border/60 bg-background px-8 pb-4 pt-2">
          <TabsList className="bg-transparent p-0">
            <TabsTrigger value="credentials">Credentials</TabsTrigger>
            <TabsTrigger value="models">Models</TabsTrigger>
          </TabsList>
        </div>

        <ScreenBody>
          {adminBanner ? (
            <Alert variant="destructive">
              <AlertTitle>{adminBanner.title}</AlertTitle>
              <AlertDescription>{adminBanner.description}</AlertDescription>
            </Alert>
          ) : null}

          <ScreenContent className="flex-1">
            <TabsContent value="credentials" className="flex flex-1 flex-col">
              <CredentialsTab
                credentials={credentials}
                providers={providers}
                loading={loadingCredentials}
                readOnly={readOnly}
                showProviderWarning={showProviderNotice}
                error={credentialsError}
                onEdit={(credential) => onCredentialEdit?.(credential)}
                onTest={(credential) => onCredentialTest?.(credential)}
                onDelete={(credential) => onCredentialDelete?.(credential)}
              />
            </TabsContent>
            <TabsContent value="models" className="flex flex-1 flex-col">
              <ModelsTab
                models={models}
                loading={loadingModels}
                readOnly={readOnly}
                canCreateModel={canCreateModel}
                error={modelsError}
                onEdit={(model) => onModelEdit?.(model)}
                onTest={(model) => onModelTest?.(model)}
                onDelete={(model) => onModelDelete?.(model)}
              />
            </TabsContent>
          </ScreenContent>
        </ScreenBody>
      </ScreenTabs>
    </Screen>
  );
}

export type { TabValue as LlmSettingsTab };
