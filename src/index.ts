import * as h5 from "h5wasm";
import { ACCESS_MODES, Dataset, Group } from "h5wasm"
import { indexedDBFilenameSymbol, isDataset, isGroup, isAttribute, isStreaming } from "./globals";

import FileProxy, { FileProxyOptions } from "./lazy/FileProxy";
import { ArbitraryObject, Callbacks } from "./types";

import * as polyfills from './polyfills'
import fs from 'node:fs'
import process from 'node:process'

export type IOInput = {
  debug?: boolean,
  postprocess?: Function,
}

import { getAllPropertyNames, objectify } from "./utils/properties";

export * from './utils/properties' // Exporting all property helpers
export * from './globals' // Exporting all globals

export const ready = polyfills.ready

const ignore = ['constructor', 'slice'] // NOTE: Slice doesn't actually work for some reason...
const carryAllProperties = (target: any, source: any) => {
  const keys = getAllPropertyNames(source)
  keys.forEach(prop => {
    if (!ignore.includes(prop)) Object.defineProperty(target, prop, { get: () => {
      const isFunc = typeof source[prop] === 'function'
      if (isFunc) return source[prop].bind(source)
      else return source[prop]
    }, enumerable: false, configurable: false })
  })
}


type FetchOptions = {
  // useLocalStorage?: boolean | FileProxyOptions,
  useStreaming?: boolean,
} & Callbacks

type UploadOptions = {
  multiple?: boolean
}

type Options = {
  filename?: string
} & UploadOptions & FetchOptions

type FileType = {
  [key: string | symbol]: any
  indexedDBFilenameSymbol: string
}

type FileObject = {
  name: string,
  // read?: any,
  // write?: any,
  file?: FileType
  reader?: h5.File
  url?: string
}

type ResolvedFileObject = FileObject & { reader: h5.File }


function isNumeric(str: any) {
  if (typeof str != "string") return false // we only process strings!  
  return !isNaN(str as any) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
}

export class HDF5IO {

  files: Map<string, FileObject> = new Map();

  _path: string = globalThis.process ? '/' : "/hdf5-io" // No path for nodejs
  _debug: boolean;
  __postprocess: Function = (o: any) => o // Returns processed file object

  _extension?: string // = 'hdf5'
  _mimeType: string = 'application/x-hdf5'


  constructor(options: IOInput = {}) {
    this._debug = options.debug ?? false;
    if (options?.postprocess) this.__postprocess = options.postprocess;

    // Ensure BigInto Support
    (BigInt.prototype as any).toJSON = function () { return this.toString() }
  }

  // ---------------------- Local Filestorage Utilities ----------------------

  // Ensure path has slash at the front
  _convertPath = (path: string) => {
    const hasSlash = path[0] === '/'
    return path = (hasSlash) ? path : `/${path}` // add slash
  }

  initFS = (path: string = this._path) => {


    this._path = path = this._convertPath(path) // set latest path

    if (globalThis.process) {
      const cwd = process.cwd()
      this._path = (cwd.slice(25) === path.slice(25)) ? path : `${cwd}${path}`
      if (!fs.existsSync(this._path)) fs.mkdirSync(this._path);
      process.chdir(`.${path}`);
      return true
    }

    // Note: Can wait for filesystem operations to complete
    return new Promise(async resolve => {

      await h5.ready // NOTE: This is the only reason it's async

      const fs = h5.FS as FS.FileSystemType // Resolved filesystem type

      fs.mkdir(path);
      fs.chdir(path);

      try {
        // Create a local mount of the IndexedDB filesystem:
        fs.mount((fs as any).filesystems.IDBFS, {}, path)
        if (this._debug) console.warn(`[hdf5-io]: Mounted IndexedDB filesystem to ${path}`)
        this.syncFS(true, path)
        resolve(true)
      } catch (e) {
        switch ((e as any).errno) {
          case 44:
            console.warn('Path does not exist');
            resolve(false)
            break;
          case 10:
            console.warn(`Filesystem already mounted at ${path}`);
            if (this._debug) console.log('[hdf5-io]: Active Filesystem', await this.list(path))
            resolve(true)
            break;
          default:
            console.warn('Unknown filesystem error', e);
            resolve(false)
        }
      }
    })

  }

  syncFS = (read: boolean = false, path = this._path) => {

    if (globalThis.process) return // No need to sync in nodejs

    path = this._convertPath(path) 
    return new Promise(async resolve => {
      await h5.ready
      const fs = h5.FS as any // Resolved filesystem type
      if (this._debug && !read) console.warn(`[hdf5-io]: Pushing all current files in ${path} to IndexedDB`)
      fs.syncfs(read, async (e?: Error) => {
        if (e) {
          console.error(e)
          resolve(false)
        } else {
          if (this._debug) {
            const list = await this.list(path)
            if (read) console.warn(`[hdf5-io]: IndexedDB successfully read into ${path}!`, list)
            else console.warn(`[hdf5-io]: All current files in ${path} pushed to IndexedDB!`, list)
          }
          resolve(true)
        }
      })
    })

  }

  // ---------------------- New HDF5IO Methods ----------------------

  // Allow Upload of HDF5 Files from the Browser
  upload = async (ev?: Event | HTMLInputElement['files'], options: UploadOptions = {}) => {


    const onComplete = async (files: File[]) => {
      let returned = await ((files.length === 1) ? this.load(files[0].name) : Promise.all(Array.from(files.map(f => this.load(f.name)))))
      console.log('[hdf5-io]: Files Uploaded', returned)
      return returned
    }

    if (ev) {
      const files = (ev as any).target?.files ?? ev as HTMLInputElement['files']
      const validFiles = await this.#upload(files)
      return await onComplete(validFiles)
    } else {
      const file = document.createElement('input')
      file.type = 'file'
      if (options.multiple) file.multiple = true
      file.click()

      return new Promise((resolve, reject) => {
        file.onchange = async (ev) => {
          const input = ev.target as HTMLInputElement;
          const files = await this.#upload(input.files)
          if (files.length) resolve(await onComplete(files))
          else reject('No valid files selected')
        }
      })
    }
  }

  #upload = async (files: HTMLInputElement['files'] | (Blob & {name: string})[]) => {
    if (files && files?.length) {
      return (await Promise.all(Array.from(files).map(async f => {
        if (!this._extension || f.name.includes(this._extension)) {
          let ab = await f.arrayBuffer();
          console.warn(`[hdf5-io]: Uploading ${f.name}`)
          await this.#write(f.name, ab)
          return f
        } else {
          console.error(`[hdf5-io]: File ${f.name} is not an NWB file.`)
          return null
        }
      }))).filter(f => f) as File[]
    }

    else return []
  }

  list = async (path: string = this._path) => {
    path = this._convertPath(path)

    await h5.ready
    let node;

    // Correction for Node.js
    if (globalThis.process) {
      const files = fs.readdirSync(path);
      return files
    }
    
    try { node = ((h5.FS as any).lookupPath(process ? path : `.${path}`))?.node }
    catch (e) { console.warn(e) }

    if (node?.isFolder && node.contents) {
      let files = Object.values(node.contents).filter((v: any) => !(v.isFolder)).map((v: any) => v.name);
      // const subfolders = Object.values(node.contents).filter((v:any) => (v.isFolder)).map((v:any) => v.name)

      // // Add Files to Registry
      // files.forEach((name: string) => {
      //   if (!this.files.has(name)) this.files.set(name, {name, file: undefined}) // undefined === capable of being loaded
      // })
      return files
    }
    else return []
  }

  blob = async (file?: any) => {
    const ab = this.arrayBuffer(file)
    if (ab) {
      await polyfills.ready
      return new Blob([ab], { type: this._mimeType });
    }
    else return undefined
  }

  // NOTE: Only called after resolution anyways...
  arrayBuffer = (file?: any) => {
    const fs = h5.FS as any // Resolved filesystem type
    return fs.readFile(file.name)
  }

  // Allow Download of NWB-Formatted HDF5 Files from the Browser
  download = async (
    input: string | FileType, // Name or file
    file?: any
  ) => {

    let name = (typeof input === 'string') ? input : input?.[indexedDBFilenameSymbol]
    if (!file && name) file = this.files.get(name)
    if (file) {

      if (file.url) throw new Error('[hdf5-io]: Cannot download streaming object to file')
      else if (!file.reader) throw new Error('[hdf5-io]: Cannot download file without reader')

      if (!name) name = file.name // Get Default Name
      file.reader.flush();

      let blob = await this.blob(file)
      if (blob) {
        var a = document.createElement("a");
        document.body.appendChild(a);
        a.style.display = "none";

        // IE 10 / 11
        const nav = (globalThis.navigator as any);
        if (nav?.msSaveOrOpenBlob) {
          nav.msSaveOrOpenBlob(blob, name);
        } else {
          var url = globalThis.URL?.createObjectURL(blob);
          a.href = url;
          const [nameNoExtension, extension] = name.match(/(.+)\.(.+)/)
          a.download = (extension || !this._extension) ? name : nameNoExtension + `.${this._extension}` // Add Extension
          a.target = "_blank";
          //globalThis.open(url, '_blank', filename);
          a.click();
          setTimeout(function () { globalThis.URL.revokeObjectURL(url) }, 1000);
        }
      } else return
    } else return
  }


  // Lazy load HDF5 Files from a URL
  stream = async (url: string, name: string, options?: FileProxyOptions, callbacks?: Callbacks) => {
    const proxy = new FileProxy(url, options, callbacks)
    const file = await proxy.load()
    Object.defineProperty(file, indexedDBFilenameSymbol, { value: name, writable: false })
    this.files.set(name, { name, file, url }) // undefined === capable of being loaded
    return file
  }

  resolveStream = async (o: any) => {
    for (let key in o) {
      const res = await o[key]
      if (res instanceof Object) await this.resolveStream(res)
    }
    return o
  }

  // Fetch HDF5 Files from a URL
  fetch = async (
    url: string,
    filename: Options['filename'],
    options: FetchOptions = {}
  ) => {

    await polyfills.ready

    if (typeof filename !== 'string') {
      const controller = new AbortController()
      const signal = controller.signal
      filename = await fetch(url, { signal }).then((res) => {
        let name = res.headers.get('content-disposition')
        controller.abort()
        if (!name) {
          const filename = res.url.split('/').pop()
          if (filename?.includes('.')) name = filename // If the URL has a filename with an extension, use that
        }
        if (!name) name = 'default.nwb'
        if (this._debug) console.log(`[hdf5-io]: Registering fetched file as ${name}`)
        return name as string
      })
    }

    let resolvedFilename = filename as string


    // Use streaming if applicable
    if (options.useStreaming) {
      const streamObject = await this.stream(url, resolvedFilename, typeof options.useStreaming === 'object' ? options.useStreaming : undefined, {
        successCallback: options.successCallback,
        progressCallback: options.progressCallback,
      })

      if (streamObject !== null) {

        console.warn(`Streaming the specification for ${filename}`)
        const specifications = await streamObject.specifications // NOTE: This may only be present in NWB files...
        await this.resolveStream(specifications)
        return this.__postprocess(streamObject)//, false)
      }
    }

    // Fetch the file
    const tick = performance.now()

    let response = await fetch(url).then(res => {

      // Use the Streams API
      if (res.body) {
        const isNodeFetch = !res.body.getReader
        if (isNodeFetch) return res

        const reader = res.body.getReader() // isNodeFetch ? undefined : res.body.getReader() // Node vs. Browser
        const length = res.headers.get("Content-Length") as any
        let received = 0

          // On Stream Chunk
          const stream = new ReadableStream({
            start(controller) {


              let onChunk = (value: any) => {
                received += value?.length ?? 0
                if (options.progressCallback) options.progressCallback(received / length, length, url)
                controller.enqueue(value);
              }

              const onDone = () => {
                if (options.successCallback) options.successCallback(true, url)
                controller.close();
              }

              // Browser Read
              // if (reader) {
                const push = async () => {

                  const read = reader.read()
                  read.then(({ value, done }) => {
                    if (done) {
                      onDone()
                      return;
                    }

                    onChunk(value)
                    push()
                  })
                }

                push()
              // } 
              
              // // Node Read
              // else {
              //   const reader = res.body as any
              //   reader.on('data', onChunk);
              //   reader.on('end', onDone);
              // }
            }
          })

          // Read the Response
          return new Response(stream, { headers: res.headers });
      } else return new Response()
    })


    let ab = await response.arrayBuffer();

    const tock = performance.now()

    if (this._debug) console.warn(`[hdf5-io]: Fetched in ${tock - tick} ms`)

    await this.#write(resolvedFilename, ab) // Write the buffer
    return await this.load(resolvedFilename) // Read the file into an object
  }

  // Iteratively Check FS to Write File
  #write = async (name: string, ab: ArrayBuffer = new ArrayBuffer(0)) => {
    const tick = performance.now()
    await h5.ready
    const fs = h5.FS as any
    fs.writeFile(name, new Uint8Array(ab));
    const tock = performance.now()
    if (this._debug) console.warn(`[hdf5-io]: Wrote raw file (${name})in ${tock - tick} ms`)
    return true
  }

  // Parse File Information with HDF5 Knowledge
  // NOTE: This is replicated in the streaming version...so there are two sets of code doing this...
  parse = (o: h5.File | h5.Group | h5.BrokenSoftLink | h5.ExternalLink | h5.Datatype, aggregator: { [x: string]: any } = {}, key: string, keepDatasets: boolean = true, parent?: h5.File | Group) => {

    if (o) {

      // Datasets
      if (o instanceof Dataset) {
        // console.log('Is a dataset', o)

        // Ensure the value is always resolved as an object
        let obj = aggregator[key] = objectify(o.value)
        Object.defineProperty(obj, isDataset, { value: true, enumerable: false, configurable: false })

        // Create non-enumerable, read-only properties for the object
        carryAllProperties(obj, o)

        Object.defineProperty(aggregator, key, {
            get:  () => obj, 
            // NOTE: Attributes cannot be written at the moment...
            set: (value) => {
              if (value === obj) return // Don't do anything if the value is the same
              if (value?.valueOf) value = value.valueOf() // save simple values
              console.log('TRYING TO UPDATE DATASET', key, value, o)
              if (parent) parent.create_dataset(key, value); // Cannot create something that already exists
            },
            enumerable: true,
            configurable: true // Allow configuration so that you can rename the variable
        })
      }

      // Groups
      else if (o instanceof Group) {
        let keys = o.keys()
        keys.forEach((k: string) => {
          const group = o.get(k)
          const agg = aggregator[key]
          agg[k] = {} // create a group
          Object.defineProperty(agg[k], isGroup, { value: true, enumerable: false, configurable: false })

          if (group) agg[k] = this.parse(group, agg, k, keepDatasets, o)
        })
      }

      if (o instanceof h5.BrokenSoftLink || o instanceof h5.ExternalLink || o instanceof h5.Datatype) return 

      // Proxy Attributes onto the object itself
      for (let a in o.attrs) {
        const val = o.attrs[a].value
        let obj = aggregator[key][a] = (val) ? objectify(val) : val
        if (obj) {
          carryAllProperties(obj, o.attrs[a])
          Object.defineProperty(obj, isAttribute, { value: true, enumerable: false, configurable: false })
        } else console.error('No value for attribute', a, 'in', o.attrs[a])

        Object.defineProperty(aggregator[key], a, { 

          // value: obj, 
          get:  () => obj, 

          // NOTE: Attributes cannot be written at the moment...
          set: (value) => {
            console.warn('TRYING TO UPDATE ATTRIBUTE', key, a, value, o)
            o.create_attribute(a, value)
            // o.attrs[a] = value
          },
          enumerable: true,
          configurable: true // Allow configuration so that you can rename the variable
        })

      }
    }

    return aggregator[key]
  }

  // ---------------------- Core HDF5IO Methods ----------------------

  #fileFound = (entry: any) =>  Number(entry.reader?.file_id) != -1

  load = async (
    name?: string | null,
    options: Options = {}
  ): Promise<any> => {

    await h5.ready // Necessary tor effective use of h5.File

    if (name == null) return this.upload(undefined, options)
    if (typeof name !== 'string') throw new Error(`[hdf5-io]: Invalid file name ${name}`)

    // Catch remote files
    let isRemote: URL | undefined
    try { isRemote = new URL(name) } catch { }
    if (isRemote) return this.fetch(name, options.filename, options)

    let file = await this.get(name) //, { useLocalStorage: options.useLocalStorage })

    if (this.#fileFound(file)) {

      const resolved = file as ResolvedFileObject

      const tick = performance.now()

      // Parse the data using the modifier
      let innerKey = 'res'
      let aggregator: ArbitraryObject = { [innerKey]: {} }

      this.parse(resolved.reader, aggregator, innerKey)

      // Postprocess the data using an arbitrary function
      const parsed = aggregator[innerKey]

      if (this._debug) console.warn(`[hdf5-io]: Parsed ${name}`) //, parsed)

      Object.defineProperty(parsed, indexedDBFilenameSymbol, { value: name, writable: false })

      resolved.file = this.__postprocess(parsed)

      if (this._debug) console.warn(`[hdf5-io]: Processed ${name}`) //, resolved.file)

      const tock = performance.now()

      if (this._debug) console.warn(`[hdf5-io]: Read file in ${tock - tick} ms`)

      return resolved.file

    } else {
      console.error(`[hdf5-io]: File ${name} not found`)
      return
    }
  }

  // Get File by Name
  get = async (name: string, options: {
    mode?: keyof (typeof ACCESS_MODES)
    // useLocalStorage?: Options['useLocalStorage']
    create?: boolean
  } = {}): Promise<ResolvedFileObject | undefined> => {

    let { 
      mode, 
      // useLocalStorage, 
      create 
    } = options

    if (!mode) mode = 'a'
    // if (!useLocalStorage) useLocalStorage = true

    if (!name) throw new Error(`[hdf5-io]: Invalid file name ${name}`)
    let o = this.files.get(name)

    if (!o) {
      o = { name }
      this.files.set(name, o)
    }

    const resolved = o as ResolvedFileObject

    if (mode) {
      if (resolved.reader?.mode !== mode) {
        if (resolved.reader) resolved.reader.close() // Maintain only one open reader for a particular file 
        resolved.reader = new h5.File(name, mode);
      }
    } 
    
    // else if (useLocalStorage && (name && resolved.file === undefined)) {
    //   if (this._debug) console.warn(`[hdf5-io]: Returning local version from ${this._path}`)
    //   this.load(name)
    // }

    if (!this.#fileFound(resolved)) {
      this.files.delete(name) // Remove the file from the cache
      if (create) {
        const success = await this.#write(name)
        const entry = (success) ? await this.get(name, {  ...options, create: false }) : undefined // Get the file again without creating it if creation failed
        if (this.#fileFound(entry)) return entry
        else console.error('[hdf5-io]: Could not create file', name)
      }
    }

    return resolved
  }

  #save = async (path: string = this._path) => {
    const file = this.files.get(path)
    if (file) {
      if (file.url) throw new Error('[hdf5-io]: Cannot save streaming object to file')
      else if (!file.reader) throw new Error('[hdf5-io]: Cannot save file without reader')
      else {
        await this.syncFS(false, path)
        return path
      }
    } else {
      console.log('[hdf5-io]: No file found to save')
      return false
    }
  }

  save = async (o: ArbitraryObject, name: string = o[indexedDBFilenameSymbol], limit = false) => {

    await h5.ready // Make sure the library is ready

    if (!name) throw new Error(`[hdf5-io]: Invalid file name ${name}`)
    if (o[isStreaming]) throw new Error('[hdf5-io]: Cannot write streaming object to file')

    let file = await this.get(name, { create: true }) // Create if it doesn't exist
    
    if (this._debug) console.log('[hdf5-io]: Writing file', name)//, file, o)

    if (this.#fileFound(file)) {

      const resolved = file as ResolvedFileObject

      const tick = performance.now()

      // Write Arbitrary Object to HDF5 File 

      const firstAcquisition = o.acquisition ? Object.keys(o.acquisition)[0] : null // NOTE: This is only for testing purposes...

      // NOTES
      // - .specloc is an undefined type when resaved, but originally an object reference...
      let writeObject = (
        o: any,
        path?: string,
        parent: Group | Dataset | h5.File = resolved.reader,
        keys: string[] = Object.keys(o) // NOTE: This needs to grab non-enumerable properties originally on the spec
        // keys: string[] = getAllPropertyNames(o))
      ) => {

        // console.warn('Checking...', path)
        if (firstAcquisition && limit && path && path.includes(firstAcquisition.slice(0,5)) && !path.includes(firstAcquisition)) return // Only save the information for first acquisition

        keys.forEach(k => {

          const newPath = `${(path) ? `${path}/` : ''}${k}` // ASSUMPTION: Spec uses snake case

          // Don't save methods
          const value = o[k]

          let type: 'dataset' | 'group' | 'attribute' | null = null

          if (!(typeof value === 'function')) {
            if (parent instanceof Dataset) type = 'attribute'
            else if (typeof value === 'object') {
              if (value[isAttribute]) type = 'attribute'
              else if (value[isDataset]) type = 'dataset'
              else if (value[isGroup]) type = 'group'
              else if (value.constructor.name === 'Object' || !(globalThis as any)[value.constructor.name]) type = 'group'
              else type = 'dataset'
            } else type = 'attribute'
          }


          switch (type) {
            case 'dataset':
                // return // No datasets
                const p1 = parent as Group || h5.File
                let res = value.valueOf()
                const dataset = (p1 as any).create_dataset(k, res);
                const keys = Object.keys(value)
                writeObject(value, newPath, dataset, keys.filter(k => !isNumeric(k)))
              // }
              break;
            case 'group':
              const group = resolved.reader.create_group(newPath);
              if (group) writeObject(value, newPath, group)
              else console.log('[hdf5-io]: Failed to create group', newPath, value)
              break;
            case 'attribute':
              if (value) {
                let attrVal = value
                const typeOf = typeof attrVal
                if (typeOf === 'object' && !attrVal.constructor) break; // Null object (TODO: Actually use in this library for things...)
                // if (typeOf === 'bigint') attrVal = Number(attrVal) // Convert BigInt to Number

                const res = attrVal?.valueOf ? attrVal.valueOf() : attrVal
                // const dtype = attrVal.dtype
                // const hasType = dtype && dtype !== 'unknown'
                // const spec = hasType ? [attrVal.shape, dtype] : []
                parent.create_attribute(k, res) //, ...spec); 
              } else console.log('[hdf5-io]: Ignoring attribute', k, value)
              break;
            default:
              console.error('Ignore', k, value)
          }
        })
      }

      // if (!o[indexedDBFilenameSymbol]) 
      writeObject(o) // Only write new objects (others are automatically updated)

      const tock = performance.now()
      if (this._debug) console.warn(`[hdf5-io]: Wrote file object to browser filesystem in ${tock - tick} ms`)
    }

    return await this.#save(name) // Save when writing
  }

  close = (name?: string) => {
    if (!name) this.files.forEach((_, k) => this.close(k)) // Close all files
    else {
      const fileObj = this.files.get(name)
      if (fileObj) {
        if (fileObj.reader) fileObj.reader.close()
        this.files.delete(name)
      }
    }
  }
}

export default HDF5IO