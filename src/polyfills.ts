import fs from 'node:fs'
import { Worker as nodeWorker } from 'node:worker_threads'
import { Blob as nodeBlob } from 'node:buffer'

if (!globalThis.Blob) (globalThis as any).Blob = nodeBlob
if (!globalThis.Worker) (globalThis as any).Worker = nodeWorker

// Node Polyfills
// export let fetch = (globalThis as any).fetch
export let Blob = globalThis.Blob
export let process = (globalThis as any).process // NOTE: This is not a polyfill, but a check for node
export let Worker = globalThis.Worker

export {
    fs
}