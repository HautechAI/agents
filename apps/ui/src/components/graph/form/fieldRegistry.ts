// Central field registry so that form wrappers can import without causing fast-refresh warnings.
import { KeyValueField } from './keyValueField';
import { VaultEnvRefs } from './vaultEnvRefs';

export { KeyValueField };
export const fieldsRegistry = { KeyValueField, VaultEnvRefs } as Record<string, unknown>;
