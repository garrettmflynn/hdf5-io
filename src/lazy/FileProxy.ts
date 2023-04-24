import { isStreaming } from '../globals'
import { Callbacks } from '../types'
import * as global from './global'

import workerURL from './adv.worker?worker&url' // Works when hdf5-io is used in a 3rd party script

export type FileProxyOptions = {
    LRUSize?: number
    requestChunkSize?: number
}


const defaultRequestChunkSize = 1024
const defaultLRUSize = 100

class FileProxy {

    url: string
    worker: Worker;
    options: FileProxyOptions = {}
    
    callbacks: Callbacks

    #toResolve: {[x:string]: {resolve: Function, timestamp: number}} = {}
    file: any = {}

    constructor(url?: string, options?: FileProxyOptions, callbacks?: Callbacks) {

        
        this.set(url, options, callbacks)

        // Initialize Worker
        if (globalThis.Worker) {
            this.worker = new Worker(workerURL, { type: 'module' })

            this.worker.addEventListener("message", (event) => {
                const info = this.#toResolve[event.data[global.lazyFileProxyId]]
                if (info) info.resolve(event.data.payload)
                else if (event.data.type === 'progress' && this.callbacks.progressCallback) this.callbacks.progressCallback(event.data.payload.ratio, event.data.payload.length, event.data.payload.id)
                else if (event.data.type === 'success' && this.callbacks.successCallback) this.callbacks.successCallback(event.data.payload.fromRemote, event.data.payload.id)
                
                else console.error('Message was not awaited...')
            })
        } else console.log("Workers are not supported");
    }

    set = (url?: string, options?: FileProxyOptions, callbacks?: Callbacks) => {
        if (url) this.url = url
        if (options) this.options = options
        if (callbacks) this.callbacks = callbacks
    }

    get = async (path = '/') => {
        const o = {action: "get", payload: { path }}
        const raw = await this.send(o) as any

        if (raw.type === 'error') throw new Error(raw.value)

        let target = this.file

        const split = path.split('/').filter(v => !!v)
        const key = split.pop() as string
        for (let str of split) target = await target[str]

        // Create entry in private file
        const parent = target
        
        let onPropertyResolve

        if (key) {
            const desc = Object.getOwnPropertyDescriptor(parent, key)
            if (!desc || desc.get) {
                let value = raw.value ?? {}
                onPropertyResolve = parent[global.onPropertyResolved]

                // Ensure you will capture attributes on values
                if (raw.attrs && Object.keys(raw.attrs).length > 0) {
                    let updatedVal = value
                    if (typeof value === 'number') updatedVal = new Number(value)
                    else if (typeof value === 'string') updatedVal = new String(value)
                    else if (typeof value === 'boolean') updatedVal = new Boolean(value)
                    value = updatedVal
                //    if (updatedVal !== value) console.warn('Requires conversion to an object to hold metadata', path, updatedVal, value, raw.attrs)
                }

                Object.defineProperty(parent, key, {value, enumerable: true, configurable: true}) // redefine getter with empty object that will be filled now
            } else return target[key]

            target = await target[key]
        }

        // Add notice of streaming
        if (typeof target === 'object') Object.defineProperty(target, isStreaming, {value: true})


        // Proxy private file properties (which are always resolved) 
        if (raw.attrs) {
            for (let key in raw.attrs) {

                // Make an object with a value key
                if (!target || typeof target !== 'object') {
                    Object.defineProperty(parent, key, {value: {value: target}, enumerable: true, configurable: true})
                    target = parent[key]
                }

                if (!Array.isArray(target)){
                    Object.defineProperty(target, key, {
                        get: () => raw.attrs[key].value,
                        enumerable: true,
                        configurable: true // Can be redeclared
                    }) 
                }
                
            }
        }
        
        if (raw.children) {
            for (let key of raw.children) {
                Object.defineProperty(target, key, {
                    get: () => {
                        const desc = Object.getOwnPropertyDescriptor(target, key)
                        if (!desc || desc.get) {
                            const updatedPath = (path && path !== '/') ? `${path}/${key}` : key
                            const res = this.get(updatedPath) // Replaces the new value for you
                            return res
                        } else return target[key] // Just get the value
                    },
                    enumerable: true,
                    configurable: true // Can be redeclared
                })
            }
        }

        // Resolve the property 
        if (onPropertyResolve) { 
            const res = await onPropertyResolve(key, target)
            return res
        }
        else return target
    }

    load = async (url?: string, options?: FileProxyOptions, callbacks?: Callbacks) => {
        this.set(url, options, callbacks)
        let LRUSize = this.options.LRUSize ?? defaultLRUSize;
        let requestChunkSize = this.options.requestChunkSize ?? defaultRequestChunkSize
        const success = await this.send({action: "load", payload: {url: this.url, LRUSize, requestChunkSize}})
        if (success) return this.get()
        else console.error('File could not be loaded...')
    }

    send = (o: any) => {
        return new Promise((resolve, reject) => {
            const id = Math.random().toString(36).substring(7);
            this.#toResolve[id] = {resolve, timestamp: Date.now()}
            o[global.lazyFileProxyId] = id
            if (this.worker) this.worker.postMessage(o);
            else reject(`Cannot send message because no worker was created to manage ${this.url}`)
        }) 
    }
}

export default FileProxy