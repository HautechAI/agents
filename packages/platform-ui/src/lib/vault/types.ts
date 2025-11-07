export type SecretKey = { mount: string; path: string; key: string };
export type SecretEntry = SecretKey & { required: boolean; present: boolean };
export type SecretFilter = 'used' | 'missing' | 'all';
export type SecretValue = string; // write-only, local state only

