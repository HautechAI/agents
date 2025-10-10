// Central field registry so that form wrappers can import without causing fast-refresh warnings.
import { KeyValueField } from './keyValueField';
import { ReferenceField } from './referenceField';
import { ReferenceEnvField } from './referenceEnvField';

export { KeyValueField };
// Keep VaultEnvRefs import out of registry to avoid accidental usage; legacy is hidden per templates
export const fieldsRegistry = { KeyValueField, ReferenceField, ReferenceEnvField } as Record<string, unknown>;
