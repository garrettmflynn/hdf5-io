import * as h5 from "h5wasm";
import { ACCESS_MODES, Dataset, Group } from "h5wasm"
// import * as h5 from "../node_modules/h5wasm/src/hdf5_hl";
// import { ACCESS_MODES, Dataset, Group } from "../node_modules/h5wasm/src/hdf5_hl";
import { indexedDBFilenameSymbol, isDataset, isGroup, isAttribute, isStreaming, changesSymbol } from "./globals";

import FileProxy, { FileProxyOptions } from "./lazy/FileProxy";
import { ArbitraryObject, Callbacks } from "./types";

import * as polyfills from './polyfills'

type PostprocessFunction = (info: ArbitraryObject, transformToSnakeCase?: boolean) => ArbitraryObject | Promise<ArbitraryObject>
export type IOInput = {
  debug?: boolean,
  postprocess?: PostprocessFunction,
  reader?: typeof h5,
  extension?: string,
  mimeType?: string,
  path?: string,
}

import { getAllPropertyNames, objectify } from "./utils/properties";

export * from './utils/properties' // Exporting all property helpers
export * from './globals' // Exporting all globals

export let ready = Promise.all([polyfills.ready, h5.ready])

const ignore = ['constructor', 'slice'] // NOTE: Slice doesn't actually work for some reason...
const carryAllProperties = (target: any, source: any, configure?: string[] | boolean) => {
  const keys = getAllPropertyNames(source)

  keys.forEach(prop => {

    const isArray = Array.isArray(configure)
    let configurable = isArray ? configure.includes(prop) : configure ?? false
    if (ignore.includes(prop)) return

    // Allow user-defined properties to override HDF5 properties

    if (isArray && Array.isArray(configure)) return

    Object.defineProperty(target, prop, { 
      configurable,
      get: () => {
          const isFunc = typeof source[prop] === 'function'
          if (isFunc) return source[prop].bind(source)
          else return source[prop]
      }, 
      enumerable: false,
    })
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

  #path: string = globalThis.process ? '/' : "/hdf5-io" // No path for nodejs
  #debug: boolean;
  #postprocess: PostprocessFunction = (o: any) => o // Returns processed file object

  #extension?: string // = 'hdf5'
  #mimeType: string = 'application/x-hdf5'
  #reader = h5

  #resolveFilesystem: Function
  #filesystem = new Promise(resolve => this.#resolveFilesystem = resolve)


  constructor(options: IOInput = {}) {
    this.#debug = options.debug ?? false;
    if (options?.postprocess) this.#postprocess = options.postprocess;
    if (options?.reader) {
      this.#reader = options.reader;
      ready = Promise.all([polyfills.ready, this.#reader.ready]) // Ensure new reader is ready
    }

    // Ensure BigInto Support
    (BigInt.prototype as any).toJSON = function () { return this.toString() }
  }

  // ---------------------- Local Filestorage Utilities ----------------------

  // Ensure path has slash at the front
  _convertPath = (path: string) => {
    const hasSlash = path[0] === '/'
    return path = (hasSlash) ? path : `/${path}` // add slash
  }

  initFS = async (path: string = this.#path) => {


    this.#path = path = this._convertPath(path) // set latest path

    // Handle Node.js Filesystem Initialization
    if (globalThis.process) {
      await ready
      const cwd = polyfills.process.cwd()
      this.#path = (cwd.slice(0, 25) === path.slice(0, 25)) ? path : `${cwd}${path}` // Full path in local filesystem
      if (!polyfills.fs.existsSync(this.#path)) polyfills.fs.mkdirSync(this.#path);
      try { polyfills.process.chdir(`.${path}`); } catch (e) {  } // Not supported in workers
      this.#resolveFilesystem(true)
      return true
    }

    // Waits for filesystem operations to complete
    return new Promise(async resolve => {

      await ready // NOTE: This is the only reason it's async

      const fs = this.#reader.FS as FS.FileSystemType // Resolved filesystem type

      fs.mkdir(path);
      fs.chdir(path);

      try {
        // Create a local mount of the IndexedDB filesystem:
        fs.mount((fs as any).filesystems.IDBFS, {}, path)
        if (this.#debug) console.warn(`[hdf5-io]: Mounted IndexedDB filesystem to ${path}`)
        await this.syncFS(true, path)
        this.#resolveFilesystem(true)
        resolve(true)
      } catch (e) {
        switch ((e as any).errno) {
          case 44:
            console.warn('Path does not exist');
            resolve(false)
            break;
          case 10:
            console.warn(`Filesystem already mounted at ${path}`);
            if (this.#debug) console.log('[hdf5-io]: Active Filesystem', await this.list(path))
            resolve(true)
            break;
          default:
            console.warn('Unknown filesystem error', e);
            resolve(false)
        }
      }
    })

  }

  syncFS = (read: boolean = false, path = this.#path) => {

    if (globalThis.process) return // No need to sync in nodejs

    path = this._convertPath(path) 
    return new Promise(async resolve => {
      await ready
      const fs = this.#reader.FS as any // Resolved filesystem type
      if (this.#debug && !read) console.warn(`[hdf5-io]: Pushing all current files in ${path} to IndexedDB`)
      fs.syncfs(read, async (e?: Error) => {
        if (e) {
          console.error(e)
          resolve(false)
        } else {
          if (this.#debug) {
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
        if (!this.#extension || f.name.includes(this.#extension)) {
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

  list = async (path: string = this.#path) => {
    path = this._convertPath(path)

    await ready
    await this.#filesystem
    
    let node;

    // Correction for Node.js
    if (globalThis.process) {
      const files = polyfills.fs.readdirSync(path);
      return files
    }
    
    try { node = ((this.#reader.FS as any).lookupPath(path))?.node }
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

  // NOTE: Browser-Only
  #blob = async (file?: any) => {
    const ab = (this.#reader.FS as any).readFile(file.name)
    if (ab) return new Blob([ab], { type: this.#mimeType });
    else return undefined
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

      let blob = await this.#blob(file)
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
          a.download = (extension || !this.#extension) ? name : nameNoExtension + `.${this.#extension}` // Add Extension
          a.target = "_blank";
          //globalThis.open(url, '_blank', filename);
          a.click();
          setTimeout(function () { globalThis.URL.revokeObjectURL(url) }, 1000);
        }
      } else return
    } else return
  }


  // Lazy load HDF5 Files from a URL
  stream = async (url: string, options?: FileProxyOptions, callbacks?: Callbacks, name?: string) => {
    await ready
    if (!name) name = await this.#resolveFilenameFromURL(url) // Resolve name if undefined
    const proxy = new FileProxy(url, options, callbacks)
    const file = await proxy.load()

    Object.defineProperty(file, indexedDBFilenameSymbol, { value: name, writable: false })
    this.files.set(name, { name, file, url }) // undefined === capable of being loaded

      
    return await this.#postprocess(file)
  }

  // Return resolved objects from a stream
  resolveStream = async (o: any | Promise<any>) => {
    const resO = await o
    let newO: {[key: string]: any} = {}
    for (let key in resO) {
      const res = await resO[key]
      if (res?.constructor === Object) newO[key] = await this.resolveStream(res) // Recurse on standard objects
      else newO[key] = res
    }
    return newO
  }

  #resolveFilenameFromURL = async (url: string) => {
      const controller = new AbortController()
      const signal = controller.signal

      let promise = fetch(url, { signal }).catch(() => fetch(url)) // Try again without aborting (vitest)
      return await promise.then(async (res) => {
        let name = res.headers.get('content-disposition')
        controller.abort()
        if (!name) {
          const filename = res.url.split('/').pop()
          if (filename?.includes('.')) name = filename // If the URL has a filename with an extension, use that
        }
        if (!name) name = 'default.nwb'
        if (this.#debug) console.log(`[hdf5-io]: Registering remote file as ${name}`)
        return name as string
      })
  }

  // Fetch HDF5 Files from a URL
  fetch = async (
    url: string,
    filename: Options['filename'],
    options: FetchOptions = {}
  ) => {

    await polyfills.ready

      // Use streaming if applicable
      if (options.useStreaming) {
        return await this.stream(url, typeof options.useStreaming === 'object' ? options.useStreaming : undefined, {
          successCallback: options.successCallback,
          progressCallback: options.progressCallback,
        })
      }

        
    if (typeof filename !== 'string') filename = await this.#resolveFilenameFromURL(url)
    let resolvedFilename = filename as string

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

    if (this.#debug) console.warn(`[hdf5-io]: Fetched in ${tock - tick} ms`)

    // await this.#write(resolvedFilename, ab) // Write the buffer
    await this.#write(resolvedFilename, ab) // Write the buffer
    return await this.load(resolvedFilename) // Read the file into an object
  }

  // Iteratively Check FS to Write File
  #write = async (name: string, ab: ArrayBuffer = new ArrayBuffer(0)) => {
    const tick = performance.now()
    await this.#reader.ready
    const fs = this.#reader.FS as any
    // fs.rmdir(name)
    try {
      if (globalThis.process) polyfills.fs.writeFileSync(name, new Uint8Array(ab))
      else await fs.writeFile(name, new Uint8Array(ab));
    } catch (e) {
      console.error(`[hdf5-io]: Failed to write file ${name} to FS`, e)
      return false
    }
    const tock = performance.now()
    if (this.#debug) console.warn(`[hdf5-io]: Wrote raw file (${name})in ${tock - tick} ms`)
    return true
  }

  // Always resolve as objects
  #process = (value: any, object: any, type = 'group', attrs?: ArbitraryObject) => {
    let symbol: symbol;
    switch (type) {
      case 'group': 
        symbol = isGroup
        break;
        
      case 'dataset':
        symbol = isDataset
        break;

      case 'attribute':
        symbol = isAttribute
        break;

      default:
        symbol = isGroup
    }

    value = (type === 'attribute' && !value) ? value : objectify(value)
    if (value) {
      carryAllProperties(value, object, attrs ? Object.keys(attrs) : undefined)
      Object.defineProperty(value, symbol, { value: true, enumerable: false, configurable: false })
    }
    return value
  }

  // Parse File Information with HDF5 Knowledge
  // NOTE: This is replicated in the streaming version...so there are two sets of code doing this...
  parse = (
    o: h5.File | h5.Group | h5.BrokenSoftLink | h5.ExternalLink | h5.Datatype, 
    aggregator: { [x: string]: any } = {}, 
    key: string, 
    keepDatasets: boolean = true, 
    parent?: h5.File | Group,
    onChange: Function = () => {},
    ) => {
      
      if (!parent && o instanceof this.#reader.File) parent = o
      const resolvedParent = parent as h5.File | h5.Group

    if (o) {

      const attrs = 'attrs' in o ? o.attrs : {} // Only access once when opened

      // Datasets
      if (o instanceof this.#reader.Dataset) {
        let value = aggregator[key] =this.#process(o.value, o, 'dataset', attrs) // NOTE: Must reset the aggregator here...
        Object.defineProperty(aggregator, key, {
          get:  () => value, 
          set: (v) => {
            if (v === value) return // Don't do anything if the value is the same
            value = this.#process(v, o, 'dataset', attrs) // Active change
            onChange(resolvedParent.path, key, 'dataset', value)
          },
          enumerable: true,
          configurable: true // Allow configuration so that you can rename the variable
      })
      }

      // Groups
      else if (o instanceof this.#reader.Group) {
        let keys = o.keys()
        let value = aggregator[key] = this.#process(aggregator[key] ?? {}, o, 'group', attrs) // NOTE:  Must reset the aggregator here...

        Object.defineProperty(aggregator, key, {
          get:  () => value,
          set: () => {
            console.error('[hdf5-io]: No support for setting a group')
            // this.#processGroup(v, o)
          }
        })

        // Nested Groups, Datasets, and Stuff
        keys.forEach((k: string) => {
          const entry = o.get(k)

          if (entry) this.parse(
              entry, 
              value, 
              k, 
              keepDatasets, 
              o,
              onChange
            )

            // TODO: Support group changes here...
        })
      }

      if (o instanceof this.#reader.BrokenSoftLink || o instanceof this.#reader.ExternalLink || o instanceof this.#reader.Datatype) return 

      // Proxy Attributes onto the object itself
      for (let a in attrs) {
        const object = attrs[a]
        let value = this.#process(object.value, object, 'attribute', undefined)

        Object.defineProperty(aggregator[key], a, { 

          // value: obj, 
          get:  () => value, 

          set: (v) => {
            if (v === value) return // Don't do anything if the value is the same
            value = this.#process(v, object, 'attribute', undefined)
            onChange(o.path, a, 'attribute', value)
          },
          enumerable: true,
          configurable: true // Allow configuration so that you can rename the variable
        })

      }
    }

    return aggregator[key]
  }

  // ---------------------- Core HDF5IO Methods ----------------------

  #fileFound = (reader: any) =>  {
    const val = (reader.reader ?? reader)?.file_id
    return val && Number(val) != -1
  }

  load = async (
    name?: string | null,
    options: Options = {}
  ): Promise<any> => {

    await ready // Necessary tor effective use of h5.File

    if (name == null) return this.upload(undefined, options)
    if (typeof name !== 'string') throw new Error(`[hdf5-io]: Invalid file name ${name}`)

    // Catch remote files
    let isRemote: URL | undefined
    try { isRemote = new URL(name) } catch { }
    if (isRemote) return this.fetch(name, options.filename, options)

    let file = await this.get(name, { mode: 'r' }) //, { useLocalStorage: options.useLocalStorage })
    if (this.#fileFound(file)) {

      const resolved = file as ResolvedFileObject

      const tick = performance.now()

      // Parse the data using the modifier
      let innerKey = 'res'
      let aggregator: ArbitraryObject = { [innerKey]: {} }


      const changes: { [x: string]: {[x: string]: any[]} } = {}
      const registerChange = (path:string, key:string, type: 'dataset' | 'attribute', value: any) => {
        if (!changes[path]) changes[path] = {}
        if (!changes[path][key]) changes[path][key] = []
        changes[path][key].push({
          type,
          value
        })
      }

      this.parse(resolved.reader, aggregator, innerKey, undefined, undefined, registerChange)

      // Postprocess the data using an arbitrary function
      const parsed = aggregator[innerKey]

      if (this.#debug) console.warn(`[hdf5-io]: Parsed ${name}`) //, parsed)

      const processed = await this.#postprocess(parsed)
      Object.defineProperty(processed, indexedDBFilenameSymbol, { value: name, writable: false })
      Object.defineProperty(processed, changesSymbol, { value: changes, writable: false })

      resolved.file = processed as FileType

      if (this.#debug) console.warn(`[hdf5-io]: Processed ${name}`) //, resolved.file)

      const tock = performance.now()

      if (this.#debug) console.warn(`[hdf5-io]: Read file in ${tock - tick} ms`)

      this.close(name) // Close reader

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
    // clear?: boolean
  } = {}): Promise<ResolvedFileObject | undefined> => {

    let { 
      // useLocalStorage, 
      mode = 'r',
      create,
      // clear
    } = options

    // if (clear) await this.#write(name)

    // if (!useLocalStorage) useLocalStorage = true

    if (!name) throw new Error(`[hdf5-io]: Invalid file name ${name}`)
    let o = this.files.get(name)

    if (!o) {
      o = { name }
      this.files.set(name, o)
    }

    const resolved = o as ResolvedFileObject

    let reader = resolved.reader
    if (reader) reader.close() // Close the reader if it exists (to avoid multiple readers on the same file)
    
    reader = new this.#reader.File(name, mode); // Start by reading

    if (this.#fileFound(reader)) resolved.reader = reader
    else {
      console.log('[hdf5-io]: Could not open file', name, reader)
      this.files.delete(name) // Remove the file from the cache
      if (create) {
        const success = await this.#write(name)
        const entry = (success) ? await this.get(name, {  ...options, create: false }) : undefined // Get the file again without creating it if creation failed
        if (this.#fileFound(entry)) return entry
        else console.warn('[hdf5-io]: Could not create file', name)
      } else console.error('[hdf5-io]: Could not open file', name)
    }
    
    // else if (useLocalStorage && (name && resolved.file === undefined)) {
    //   if (this.#debug) console.warn(`[hdf5-io]: Returning local version from ${this.#path}`)
    //   this.load(name)
    // }

    return resolved
  }

  #save = async (path: string = this.#path) => {
    const file = this.files.get(path)
    if (file) {
      if (file.url) throw new Error('[hdf5-io]: Cannot save streaming object to file')
      else if (!file.reader) throw new Error('[hdf5-io]: Cannot save file without reader')
      else {
        this.close(path) // Close to register changes
        await this.syncFS(false, path)
        return path
      }
    } else {
      console.log('[hdf5-io]: No file found to save')
      return false
    }
  }

  // Get valueOf (including arrays)
  #preprocessValue = (obj: any): any => {
    if (obj && typeof obj === 'object') {
      if (Array.isArray(obj)) return obj.map((o: any) => this.#preprocessValue(o))
      else if (obj.valueOf) return obj.valueOf()
    }
    return obj
  }


  #writeChange = (
    path: string, 
    name: string, 
    value: any, 
    type: 'dataset' | 'group' | 'attribute', 
    writable: h5.File,  
    parent: any = writable,
    changes?: any
  ) => {
    switch (type) {
      case 'dataset':
          // return // No datasets
          const p1 = parent as Group || h5.File
          let res = this.#preprocessValue(value); // Get valueOf
          try {
            const dataset = (p1 as any).create_dataset(name, res) //, value.shape, value.dtype);
            const keys = Object.keys(value)
            this.#writeObject(value, path, writable, {
              parent: dataset, 
              keys: keys.filter(k => !isNumeric(k)),
              changes
            })
          } catch (e) {
            console.error('[hdf5-io]: Failed to create dataset', path, value, e)
          }
        // }
        break;
      case 'group':
        try {
          const group = writable.create_group(path);
          if (group) this.#writeObject(value, path, writable, {
            parent: group,
            changes
          })
          else console.log('[hdf5-io]: Failed to create group', path, value)
        } catch (e) {
          console.error('[hdf5-io]: Failed to create group', path, value, e)
        }
        break;
      case 'attribute':
        if (value) {
          let attrVal = value
          const typeOf = typeof attrVal
          if (typeOf === 'object' && !attrVal.constructor) break; // Null object (TODO: Actually use in this library for things...)
          // if (typeOf === 'bigint') attrVal = Number(attrVal) // Convert BigInt to Number
          const res = this.#preprocessValue(attrVal);
          // const dtype = attrVal.dtype
          // const hasType = dtype && dtype !== 'unknown'
          // const spec = hasType ? [attrVal.shape, dtype] : []
          try {
            parent.create_attribute(name, res) //, attrVal.shape, dtype) // ...spec); 
          } catch (e) {
            console.error('[hdf5-io]: Failed to create attribute', path, res, value, e)
          }
        } 
        //else if (this.#debug) console.warn('[hdf5-io]: Ignoring attribute', name, value)
        break;
      default:
        console.error('Ignore', name, value)
    }
  }

  // NOTES
    // - .specloc is an undefined type when resaved, but originally an object reference...
    #writeObject = (
      o: any,
      path: string = '',
      writable: h5.File,
      options: {
        parent?: Group | Dataset | h5.File,
        keys?: string[] // NOTE: This needs to grab non-enumerable properties originally on the spec
        changes?: any
      } = {}
      // keys: string[] = getAllPropertyNames(o))
    ) => {

      const { 
        keys = Object.keys(o), 
        parent = writable, 
        changes = {}
      } = options

      // console.warn('Checking...', path)
      // if (firstAcquisition && limit && path && path.includes(firstAcquisition.slice(0,5)) && !path.includes(firstAcquisition)) return // Only save the information for first acquisition

      keys.forEach(k => {

        const newPath = `${(path) ? `${path}/` : ''}${k}` // ASSUMPTION: Spec uses snake case

        const changePath = path || '/'
        const changed = changes[changePath]?.[k]
        if (changed) {
          const { value, type } = changed.slice(-1)[0] // Get latest change
          if (parent) this.#writeChange(changePath, k, value, type, writable, parent, changes)
          changes[changePath][k] = [] // Clear changes
          return
        }

        // Don't save methods
        const value = o[k]

        let type: 'dataset' | 'group' | 'attribute' | any = null

        if (!(typeof value === 'function')) {
          if (parent instanceof this.#reader.Dataset) type = 'attribute'
          else if (typeof value === 'object') {
            if (value[isAttribute]) type = 'attribute'
            else if (value[isDataset]) type = 'dataset'
            else if (value[isGroup]) type = 'group'
            else if (value.constructor.name === 'Object' || !(globalThis as any)[value.constructor.name]) type = 'group'
            else type = 'dataset'
          } else type = 'attribute'
        }


        this.#writeChange(newPath, k, value, type, writable, parent, changes)
      })
    }

  save = async (
    o: ArbitraryObject, 
    name: string = o[indexedDBFilenameSymbol], 
    // limit = false
  ) => {

    if (!name) throw new Error(`[hdf5-io]: Invalid file name ${name}`)
    if (o[isStreaming]) throw new Error('[hdf5-io]: Cannot write streaming object to file')

    // Safety Feature in Node.js
    const changes = o[changesSymbol] 
    if (globalThis.process && changes && !Object.keys(changes).length) {
      console.log('[hdf5-io]: No changes to save')
      return name
    }

    await ready // Make sure the library is ready


    let file = await this.get(name, { 
      create: true, // Create if not found
      // clear: !changes, // Clear the entire file if new
      mode: 'w' // NOTE: This needs to be 'a', but that doesn't currently support writing existing attributes / datasets
    }) // Create if it doesn't exist
    
    if (this.#debug) console.log('[hdf5-io]: Writing file', name)//, file, o)

    if (this.#fileFound(file)) {

      const resolved = file as ResolvedFileObject

      const tick = performance.now()

      this.#writeObject(o, undefined, resolved.reader, { changes }) // Writes changes preferentially to the previous file values

      // // Just Changes
      // if (changes) {
      //   for (let path in changes) {
      //     for (let name in changes[path]) {
      //       const { value, type } = changes[path][name].slice(-1)[0] // Get latest change

      //       const parent = path === '/' ? resolved.reader as h5.File : resolved.reader.get(path) as h5.Group
      //       if (parent) this.#writeChange(path, name, value, type, resolved.reader, parent)
      //       else {
      //         console.warn('[hdf5-io]: Failed to write change', path, name, value, type, resolved.reader, parent, resolved.reader.get('/group/dataset'), resolved.reader.get('group/dataset'), resolved.reader.get('group'))
      //         // throw new Error('[hdf5-io]: Failed to write change')
      //       }
      //       changes[path][name] = [] // Clear changes
      //     }
      //   }
      // }
      
      // else this.#writeObject(o, undefined, resolved.reader) // Only write new objects (others are automatically updated)

      const tock = performance.now()
      if (this.#debug) console.warn(`[hdf5-io]: Wrote file object to browser filesystem in ${tock - tick} ms`)
    }
    
    const saved = await this.#save(name) // Save when writing

    return saved
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