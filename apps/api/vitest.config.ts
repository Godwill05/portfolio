import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    setupFiles: ['test/setup.ts'],
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
});
