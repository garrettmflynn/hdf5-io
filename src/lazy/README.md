# hdf5-io-lazy
An extension for hdf5-io to mount remote files by URL to the Emscripten filesystem, with LRU buffer

This project builds on the lazyFile implementation in https://github.com/phiresky/sql.js-httpvfs and, subsequently, https://github.com/bmaranville/lazyFileLRU from the [National Institute of Standards and Technology](https://github.com/usnistgov).

In the former implementation, the chunks are inserted (sparsely) into a javascript Array as they are loaded.

In the latter implementation, an LRU buffer (from [typescript-lru-cache](https://www.npmjs.com/package/typescript-lru-cache)) 
is used instead of an Array, with user-specified max size.

The same caveats apply to this as the original: it must be run in a web worker as it relies on synchronous fetch operations.

An example worker is specified in [./adv_worker.ts](./adv_worker.ts).