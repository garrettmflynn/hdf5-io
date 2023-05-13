import fs from 'node:fs'
import buffer from 'node:buffer'

if (!globalThis.Blob) (globalThis as any).Blob = buffer.Blob

export { fs }