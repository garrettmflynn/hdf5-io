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
          "web-worker", // Currently not working in Node.js either way
          // 'h5wasm' // Works on browser but not on Node.js
        ],
    }
  },

  test: {
    environment: 'jsdom',
    threads: false
  },

  plugins: [
    dts(),
    wasm(),
  ]
});