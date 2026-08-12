/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Anchor Desk server. Unset means run on the demo dataset. */
  readonly VITE_API_URL?: string;
  /** Matches the server's API_AUTH_TOKEN. Development only — see README. */
  readonly VITE_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
