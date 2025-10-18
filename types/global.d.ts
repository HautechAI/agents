export {};

declare global {
  // Optional run service injected by runtime; typed loosely as an index signature to avoid any
  var __agentRunsService: unknown | undefined;
}

