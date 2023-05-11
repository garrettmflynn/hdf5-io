/// <reference types='vitest' />
import { defineConfig } from 'vite'

import wasm from "vite-plugin-wasm";
import dts from 'vite-plugin-dts'

export default defineConfig({
  base: '',

  worker: {
    format: 'es'
  },

  build: {
    target: 'esnext',
    // minify: false,
    lib: {
      entry: 'src/index',
      name: 'hdf5',
      fileName: (format) => `index.${format}.js`,
    },
    rollupOptions: {
        external: [
          "node:buffer",
          "node:fs",
          "web-worker"
        ],
    }
  },

  test: {
    environment: 'jsdom',
    testTimeout: 10000,
    threads: false
  },

  plugins: [
    dts(),
    wasm(),
  ]
});