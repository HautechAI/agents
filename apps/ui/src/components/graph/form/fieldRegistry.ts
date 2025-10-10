// Central field registry so that form wrappers can import without causing fast-refresh warnings.
import { KeyValueField } from './keyValueField';
import { VaultEnvRefs } from './vaultEnvRefs';
import { ReferenceField } from './referenceField';
import { ReferenceEnvField } from './referenceEnvField';

export { KeyValueField };
export const fieldsRegistry = { KeyValueField, VaultEnvRefs, ReferenceField, ReferenceEnvField } as Record<string, unknown>;
