/// <reference types='vitest' />
import { defineConfig } from 'vite'

import wasm from "vite-plugin-wasm";
import dts from 'vite-plugin-dts'

export default defineConfig({
  base: '',

  worker: {
    format: 'es'
  },

  resolve: {
    alias: {
      fs: 'rollup-plugin-node-polyfills/polyfills/fs',
      worker_threads: 'rollup-plugin-node-polyfills/polyfills/worker_threads',
      buffer: 'rollup-plugin-node-polyfills/polyfills/buffer',
    },
  },

  build: {
    target: 'esnext',
    // minify: false,
    lib: {
      entry: 'src/index',
      name: 'hdf5',
      fileName: (format) => `index.${format}.js`,
    },
    // rollupOptions: {
    //   output: {
    //     exports: 'named'
    //   },
    // }
  },

  test: {
    environment: 'jsdom'
  },

  plugins: [
    dts(),
    wasm(),
  ]
});