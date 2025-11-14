// Centralized labels and shared constants for server
// Supported Docker platforms for workspace containers
export const SUPPORTED_PLATFORMS = ['linux/amd64', 'linux/arm64'] as const;
export type Platform = (typeof SUPPORTED_PLATFORMS)[number];

// Container label used to record the selected platform
export const PLATFORM_LABEL = 'hautech.ai/platform';
export const ROLE_LABEL = 'hautech.ai/role';
export const THREAD_LABEL = 'hautech.ai/thread_id';
export const NODE_LABEL = 'hautech.ai/node_id';
export const WORKSPACE_VOLUME_LABEL = 'hautech.ai/workspace_volume';
