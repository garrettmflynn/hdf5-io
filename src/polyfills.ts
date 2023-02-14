// Node Polyfills

export let fetch: any;
export let Blob: any;

const isReady = new Promise(async (resolve, reject) => {

    try {
        if (typeof globalThis.process === 'object') { //indicates node

            // Fetch
            if (!globalThis.fetch)fetch = (globalThis as any).fetch = (await import('node-fetch') as any).default

            // // // FS
            // // if (!fs) fs = (globalThis as any).fs = (await import('fs')).default

            // Blob
            if (!globalThis.Blob)  Blob = (globalThis as any).Blob = (await import('node:buffer')).default.Blob
            resolve(true)
        } else resolve(true)

    } catch (err) {
        reject(err)
    }
})

export const ready = isReady