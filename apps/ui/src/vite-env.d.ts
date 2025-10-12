/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OBS_SERVER_URL?: string; // default http://localhost:4319
  readonly VITE_OBS_UI_BASE?: string; // default http://localhost:4320
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
