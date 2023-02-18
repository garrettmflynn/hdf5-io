// Node Polyfills
export let fetch = (globalThis as any).fetch
export let Blob = (globalThis as any).Blob
export let fs = (globalThis as any).fs
export let process = (globalThis as any).process // NOTE: This is not a polyfill, but a check for node
export let Worker = (globalThis as any).Worker

const isReady = new Promise(async (resolve, reject) => {

    try {
        if (typeof process === 'object') { //indicates node
            
            // // Fetch
            if (!fetch) {
                const importStr = 'node-fetch/src/index.js' // NOTE: When provided directly, this results in an asynchronous request that breaks the XMLHttpRequest API...
                fetch = (globalThis as any).fetch = (globalThis as any).fetch = (await import(importStr)).default
            }

            // // FS
            if (!fs) {
                fs = (globalThis as any).fs = (await import('node:fs')).default 
            }

            if (!Worker) {
                const importStr = 'web-worker'
                Worker = (globalThis as any).Worker = (await import(importStr)).default
            }

            // Blob
            if (!Blob) Blob = (globalThis as any).Blob = (await import('node:buffer')).default.Blob

            resolve(true)
        } else resolve(true)

    } catch (err) {
        reject(err)
    }
})

export const ready = isReady