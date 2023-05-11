import fs from 'node:fs'
import Worker from 'web-worker';
import buffer from 'node:buffer'

if (!globalThis.Blob) (globalThis as any).Blob = buffer.Blob
if (!globalThis.Worker) (globalThis as any).Worker = Worker

export { fs }