import { defineConfig } from 'tsup';

// Bundle the server into a single ESM file. @tpc/shared ships TypeScript source,
// so it is inlined (noExternal); real npm deps stay external.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@tpc\/shared/],
});
