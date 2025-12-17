# LiteLLM Settings UI patterns

_Context: PR #1164 aligns the LiteLLM settings experience with the Secrets screen primitives found in platform-ui._

## Screen layout

- **Component**: `packages/platform-ui/src/components/screens/LlmSettingsScreen.tsx`
- Use the `Screen` shell with `ScreenHeader`, `ScreenActions`, and `ScreenTabs` so the page matches other admin surfaces.
- Primary actions (`Add Credential`, `Add Model`) sit in `ScreenActions` and are swapped according to the active tab. Disable buttons when writes are blocked (read-only, missing providers, or model creation disabled).
- Tabs are rendered through `ScreenTabs` and `TabsList`; table content lives in `TabsContent` panels wrapped by `ScreenBody` ➝ `ScreenContent` for consistent spacing and scrolling.

## Table styling

- **Components**: `CredentialsTab`, `ModelsTab`
- Each tab renders inside a flex column container with a `sticky` header row (`data-testid="llm-*-table-header"`).
- Tables live inside cards with `border border-border/60 rounded-lg` to mirror Secrets tables; body rows use `divide-y` for clarity.
- Table action buttons (test, edit, delete) belong to the row and no longer appear in the surrounding screen header.

## Dialog primitives

- **Components**: `CredentialFormDialog`, `ModelFormDialog`, `TestCredentialDialog`, `TestModelDialog`
- All modals now consume the `ScreenDialog` primitives (`ScreenDialogHeader`, `ScreenDialogTitle`, `ScreenDialogDescription`, `ScreenDialogFooter`).
- Descriptions are required for accessibility; if no copy is necessary, pass a concise sentence describing the action (e.g., "Send a LiteLLM health check call …").
- Footers use `ScreenDialogFooter` with the primary action button last; secondary dismiss buttons inherit `variant="outline"` to match the Secrets dialogs.

## Testing expectations

- **Spec**: `packages/platform-ui/src/pages/__tests__/settings-llm.test.tsx`
- Queries target the screen-level `Add Credential` / `Add Model` buttons instead of tab-local buttons.
- Tests assert sticky header classes, provider warnings, and disabled states when LiteLLM admin is unavailable.
- When modifying the layout, keep the `data-testid` hooks (`llm-credentials-table-container`, row ids, etc.) intact to avoid brittle selectors.
