import { defineConfig } from 'vite'

import wasm from "vite-plugin-wasm";
import path from 'path';


export default defineConfig({

  build: {
    target: 'esnext',
    minify: false,
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      // entry: path.resolve(__dirname, 'entry.ts'),
      name: 'hdf5',
      fileName: (format) => `index.${format}.js`,
    },
    rollupOptions: {
      external: [
        "node:fs",
        "node:buffer",
      ],
      output: {
        globals: {
          "node:fs": "fs",
          "node:buffer": "buffer",
        },
        inlineDynamicImports: true,
        exports: 'named'
      },
    }
  },
  plugins: [
    wasm(),
    // topLevelAwait()
  ]
});