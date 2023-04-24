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