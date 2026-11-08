/// <reference types="vite/client" />

/** Dev only: this machine's LAN URL (e.g. http://192.168.1.48:5317), null in builds. */
declare const __LAN_ORIGIN__: string | null;
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
}
