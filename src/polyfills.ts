import fs from 'node:fs'
import Worker from 'web-worker';
import buffer from 'node:buffer'

if (!globalThis.Blob) (globalThis as any).Blob = buffer.Blob
if (!globalThis.Worker) (globalThis as any).Worker = Worker

// Node Polyfills
// export let fetch = (globalThis as any).fetch
export let Blob = globalThis.Blob
export let process = (globalThis as any).process // NOTE: This is not a polyfill, but a check for node

export {
    fs,
    Worker
}