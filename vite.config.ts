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
    minify: false,
    lib: {
      entry: 'src/index',
      name: 'hdf5',
      fileName: (format) => `index.${format}.js`,
    },
    rollupOptions: {
      external: [
        "node:fs",
        "node:buffer",
        "node:util",
        "node:stream",
      ],
      output: {
        globals: {
          "node:fs": "fs",
          "node:buffer": "buffer",
          "node:util": "util",
          "node:stream": "stream",
        },
        inlineDynamicImports: true,
        exports: 'named'
      },
    }
  },

  test: {
    environment: 'jsdom'
  },

  plugins: [
    dts(),
    wasm(),
    // topLevelAwait()
  ]
});