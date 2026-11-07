// All user-facing copy lives here so other languages (e.g. Hindi) can be added later.
export const en = {
  appName: 'Teen Patti Club',
  tagline: 'Play with friends. Virtual chips only.',
  home: {
    waking: 'Waking up the table…',
    ready: 'Table is ready',
    offline: "Can't reach the table right now. Check your connection.",
  },
} as const;

export type Strings = typeof en;
