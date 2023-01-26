import * as h5 from "h5wasm";
import  { ACCESS_MODES, Dataset, Group } from "h5wasm"
import { isDataset, isDataset, isDataset, isGroup, isStreaming } from "./globals";

import FileProxy, { FileProxyOptions } from "./lazy/FileProxy";
import { Callbacks } from "./types";

export type ArbitraryObject = {[x:string|symbol]: any}

export type IOInput = {
  debug?: boolean,
  postprocess?: Function,
  case?: caseUtils.CaseType
}

import * as caseUtils from './utils/case'
import { getAllPropertyNames, objectify } from "./utils/properties";

export * from './utils/properties' // Exporting all property helpers
export * from './globals' // Exporting all globals

type FetchOptions = {
  useLocalStorage?: boolean | FileProxyOptions,
  useStreaming?: boolean,
} & Callbacks

type FileObject = {
  name: string,
  // read?: any,
  // write?: any,
  file?: any
  reader?: h5.File
  url?: string
}

type ResolvedFileObject = FileObject & {reader: h5.File}


function isNumeric(str: any) {
  if (typeof str != "string") return false // we only process strings!  
  return !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
         !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
}

export default class HDF5IO {

  files: Map<string, FileObject> = new Map();

  _path: string = "/hdf5-io"
  _debug: boolean;
  __postprocess: Function = (o:any) => o // Returns processed file object

  _extension: string = 'hdf5'
  _mimeType: string = 'application/x-hdf5'

  case: caseUtils.CaseType = 'snake' // 'camel', 'snake', or 'pascal'

  constructor(options:IOInput={}) {
    this._debug = options.debug ?? false;
    if (options?.postprocess) this.__postprocess = options.postprocess
    if (options?.case) this.case = options.case

    // Ensure BigInto Support
    BigInt.prototype.toJSON = function() { return this.toString() }
  }

  // ---------------------- Local Filestorage Utilities ----------------------

  // Ensure path has slash at the front
  _convertPath = (path: string) => {
    const hasSlash = path[0] === '/'
    return path = (hasSlash) ? path : `/${path}` // add slash
  }

  initFS = (path:string=this._path) => {
    
    // Note: Can wait for filesystem operations to complete
    return new Promise(resolve => {
    this._path = path = this._convertPath(path) // set latest path


    h5.ready.then(async () => {

      h5.FS.mkdir(path);
      h5.FS.chdir(path);

      try {
        // Create a local mount of the IndexedDB filesystem:
        h5.FS.mount(h5.FS.filesystems.IDBFS, {}, path)
        if (this._debug) console.log(`[hdf5-io]: Mounted IndexedDB filesystem to ${path}`)
        this.syncFS(true, path)
        resolve(true)
      } catch (e) {
        switch((e as any).errno){
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
  })

  }
 
  syncFS = (read:boolean= false, path=this._path) => {
    path = this._convertPath(path)

    return new Promise(resolve => {

      h5.ready.then(async () => {
        if (this._debug && !read) console.log(`[hdf5-io]: Pushing all current files in ${path} to IndexedDB`)
        h5.FS.syncfs(read, async (e?:Error) => {
          if (e) {
            console.error(e)
            resolve(false)
          } else {
            if (this._debug)  {
              const list = await this.list(path)
              if (read) console.log(`[hdf5-io]: IndexedDB successfully read into ${path}!`, list)
              else console.log(`[hdf5-io]: All current files in ${path} pushed to IndexedDB!`, list)
            } 
            resolve(true)
          }
        })
      })
    })

  }

  // ---------------------- New HDF5IO Methods ----------------------

  // Allow Upload of HDF5 Files from the Browser
  upload = async (ev: Event) => {
    const input = ev.target as HTMLInputElement;
    if (input.files && input.files?.length) {
      await Promise.all(Array.from(input.files).map(async f => {
        let ab = await f.arrayBuffer();
        await this.#write(f.name, ab)
      }))
    }
  }

  list = async (path:string=this._path) => {
    path = this._convertPath(path)

    await h5.ready
    let node;

    try {node = (h5.FS.lookupPath(path))?.node} 
    catch (e) {console.warn(e)}

    if (node?.isFolder && node.contents) {
        let files = Object.values(node.contents).filter((v:any) => !(v.isFolder)).map((v:any) => v.name);
        // const subfolders = Object.values(node.contents).filter((v:any) => (v.isFolder)).map((v:any) => v.name)
        // Add Files to Registry
        files.forEach((name: string) => {
          if (!this.files.has(name)) this.files.set(name, {name, file: undefined}) // undefined === capable of being loaded
        })
        return files
    }
    else return []
}

blob = (file?: any) => {
  const ab = this.arrayBuffer(file)
  if (ab) {
    return new Blob([ab], { type: this._mimeType });
  }
}

arrayBuffer = (file?: any) => {
    return h5.FS.readFile(file.name)
}

  // Allow Download of NWB-Formatted HDF5 Files from the Browser
  download = (name: string, file?: any, extension: string = this._extension) => {


    if (!file) file = (name) ? this.files.get(name) : [...this.files.values()][0]
    if (file) {

      if (file.url) throw new Error('[hdf5-io]: Cannot download streaming object to file')
      else if (!file.reader) throw new Error('[hdf5-io]: Cannot download file without reader')

      if (!name) name = file.name // Get Default Name
      file.reader.flush();

    let blob = this.blob(file)
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
        let nameNoExtension = name.replace(/(.+)\.(.+)/, '$1')
        a.download = nameNoExtension + `.${extension}` // Add Extension
        a.target = "_blank";
        //globalThis.open(url, '_blank', filename);
        a.click();
        setTimeout(function () { globalThis.URL.revokeObjectURL(url) }, 1000);
      }
    } else return
  } else return
  }


  // Lazy load HDF5 Files from a URL
  stream = (url: string, name: string, options?: FileProxyOptions, callbacks?: Callbacks) => {
      const proxy = new FileProxy(url, options, callbacks)
      this.files.set(name, {name, file: proxy, url}) // undefined === capable of being loaded
      return proxy.load()
  }

  resolveStream = async (o:any) => {
      for (let key in o) {
        const res = await o[key]
        if (res instanceof Object) await this.resolveStream(res)
      }
      return o
    }

  // Fetch HDF5 Files from a URL
  fetch = async (
    url: string, 
    filename: string = 'default.hdf5', 
    options: FetchOptions = {}
  ) => {

    //  Get File from Name
    let o = ((options.useLocalStorage) ? this.get(filename, undefined) ?? { nwb: undefined } : {nwb: undefined}) as any


    // Use streaming if applicable
    if (options.useStreaming) {
      const streamObject = await this.stream(url, filename, typeof options.useStreaming === 'object' ? options.useStreaming : undefined,{
        successCallback:  options.successCallback,
        progressCallback: options.progressCallback,
      })

      if (streamObject !== null) {

        console.warn(`Streaming the specification for ${filename}`)
        const specifications = await streamObject.specifications
        await this.resolveStream(specifications)
        o.file = this.__postprocess(streamObject)//, false)
        return o.file
      }
    }

    // Only Fetch if NO Locally Cached Version
    if (!o.file) {

      const tick = performance.now()

      let response = await fetch(url).then(res => {

        // Use the Streams API
        if (res.body) {
          const reader = res.body.getReader()
          const length = res.headers.get("Content-Length") as any
          let received = 0

          // On Stream Chunk
          const stream = new ReadableStream({
            start(controller) {

              const push = async () => {

                reader.read().then(({ value, done }) => {
                  if (done) {
                    if (options.successCallback) options.successCallback(true, url)
                    controller.close();
                    return;
                  }

                  received += value?.length ?? 0
                  if (options.progressCallback) options.progressCallback(received / length, length, url)
                  controller.enqueue(value);
                  push()
                })
              }

              push()
            }
          })

          // Read the Response
          return new Response(stream, { headers: res.headers });
        } else return new Response()
      })


      let ab = await response.arrayBuffer();

      const tock = performance.now()

      if (this._debug) console.log(`[hdf5-io]: Fetched in ${tock - tick} ms`)

      await this.#write(filename, ab)
      o.file = this.read(filename)

    } else if (options.successCallback) options.successCallback(false, url)
    return o.file
  }

  // Iteratively Check FS to Write File
  #write = async (name: string, ab: ArrayBuffer) => {
      const tick = performance.now()
      await h5.ready
      h5.FS.writeFile(name, new Uint8Array(ab));
      const tock = performance.now()
      if (this._debug) console.log(`[hdf5-io]: Wrote raw file in ${tock - tick} ms`)
      return true
  }

  // Parse File Information with HDF5 Knowledge
  // NOTE: This is replicated in the streaming version...so there are two sets of code doing this...
  parse = (o: any, aggregator: { [x: string]: any } = {}, key: string, keepDatasets:boolean = true) => {

          if (o){

            // Datasets
            if (o instanceof Dataset) {
              // console.log('Is a dataset', o)

              // Ensure the value is always resolved as an object
              const object = aggregator[key] = objectify(o.value)
              Object.defineProperty(object, isDataset, { value: true, enumerable: false, configurable: false })

              // Create non-enumerable, read-only properties for the object
              const keys = getAllPropertyNames(o)
              keys.forEach(prop => {
                Object.defineProperty(object, prop, { get: () => o[prop], enumerable: false, configurable: false })
              })
            } 
            
            // Groups
            else if (o instanceof Group) {
                let keys = o.keys()
                keys.forEach((k: string) => {
                  const group = o.get(k)
                  const agg =  aggregator[key]
                  agg[k] = {} // create a group
                  Object.defineProperty(agg[k], isGroup, { value: true, enumerable: false, configurable: false })

                  agg[k] = this.parse(group, agg, k, keepDatasets)
                })
            }
            
            // Proxy Attributes onto the object itself
            for (let a in o.attrs) {
              aggregator[key][a] = o.attrs[a].value


              // Object.defineProperty(aggregator[key], a, { 
              //   get:  () => {
              //     return o.attrs[a].value
              //   }, 

              //   // NOTE: Attributes cannot be written at the moment...
              //   // set: (value) => {
              //   //   console.error('TRYING TO UPDATE ATTRIBUTE', key, a, o)
              //   //   o.attrs[a].value = value
              //   // },
              //   enumerable: true,
              //   configurable: true // Allow configuration so that you can rename the variable
              // }) // Not writable

            }
          }
  
          return aggregator[key]
        }

  // ---------------------- Core HDF5IO Methods ----------------------
  read = (name = [...this.files.keys()][0], useLocalStorage: boolean = true) => {

    // let file = this.get(name, 'r', useLocalStorage)
    let file = this.get(name, 'r', useLocalStorage)

    if (Number(file?.reader?.file_id) != -1) {

      const resolved = file as ResolvedFileObject

      const tick = performance.now()

      // Parse the data using the modifier
      let innerKey = 'res'
      let aggregator:ArbitraryObject = {[innerKey]: {}}

      this.parse(resolved.reader, aggregator, innerKey)

      // Postprocess the data using an arbitrary function
      const parsed = aggregator[innerKey]

      if (this._debug) console.log(`[hdf5-io]: Parsed HDF5 object`, parsed)
      
      resolved.file = this.__postprocess(parsed)

      if (this._debug) console.log(`[hdf5-io]: Processed HDF5 object`, resolved.file)

      const tock = performance.now()

      if (this._debug) console.log(`[hdf5-io]: Read file in ${tock - tick} ms`)

      return resolved.file

    } else {
      console.error(`[hdf5-io]: File ${name} not found`)
      return
    }
  }

  // Get File by Name
  get = (name: string = [...this.files.keys()][0], mode?: keyof (typeof ACCESS_MODES), useLocalStorage: boolean = true ) => {

    let o = this.files.get(name)

    if (!o) {
      o = { name }
      this.files.set(name, o)
    }

    const resolved = o as ResolvedFileObject

    if (mode) {

      if (resolved.reader?.mode !== mode) {
        if (resolved.reader) resolved.reader.close() // Maintain only one open reader for a particular file 

        let hdf5 = new h5.File(name, mode);
        if (mode === 'w') resolved.reader = hdf5
        else if (mode === 'r') resolved.reader = hdf5
        else if (mode === 'a') resolved.reader = hdf5
      }
    } else if (useLocalStorage && (name && resolved.file === undefined)) {
      if (this._debug) console.log(`[hdf5-io]: Returning local version from ${this._path}`)
      this.read(name)
    }

    return o
  }

  save = (path:string = this._path) => {
    console.warn('[hdf5-io]: Saving file', path)
    const file = this.files.get(path)
    if (file) {
      if (file.url) throw new Error('[hdf5-io]: Cannot save streaming object to file')
      else if (!file.reader) throw new Error('[hdf5-io]: Cannot save file without reader')
    } else console.warn('[hdf5-io]: No file found to save')
      
    this.syncFS(false, path)
  }

  write = (o: ArbitraryObject, name = [...this.files.keys()][0]) => {

    if (o[isStreaming]) throw new Error('[hdf5-io]: Cannot write streaming object to file')

    let file = this.get(name, 'w')
    console.log('[hdf5-io]: Writing file', name, file)

    if (Number(file?.reader?.file_id) != -1) {

      const resolved = file as ResolvedFileObject

      const tick = performance.now()

      // Write Arbitrary Object to HDF5 File
      let writeObject = (o: any, key?: String, parent:  Group | Dataset | h5.File = resolved.reader, keys: string[] = Object.keys(o)) => {
        keys.forEach(k => {

          const snakeKey = this.case ? caseUtils.set(k, this.case) : k // Keep original key if not set

          const newKey = `${(key) ? `${key}/` : ''}${snakeKey}` // ASSUMPTION: Spec uses snake case

          // Don't save methods
          const value = o[k]

          let type: 'dataset' | 'group' | 'attribute' | null = null

          if (!(typeof value === 'function')) {
              if (parent instanceof Dataset) type = 'attribute'
              else if (typeof value === 'object') {
                if (value[isDataset]) type = 'dataset'
                else if (value[isGroup]) type = 'group'
                else if (value.constructor.name === 'Object' || !window[value.constructor.name]) type = 'group'
                else type = 'dataset'
              } else type = 'attribute'
            }

            switch (type) {
              case 'dataset':
                const p1 = parent as Group || h5.File
                const res = value.valueOf()
                const dataset = p1.create_dataset(snakeKey, res);
                const keys = Object.keys(value)
                writeObject(value, newKey, dataset, keys.filter(k => !isNumeric(k)))
                break;
              case 'group':
                const group = resolved.reader.create_group(newKey);
                writeObject(value, newKey, group)
                break;
              case 'attribute':
                if (value) parent.create_attribute(snakeKey, value);
                break;
              default:
                console.error('Ignore', k, value)
            }
          })
      }
      
      writeObject(o)

      const tock = performance.now()
      if (this._debug) console.log(`[hdf5-io]: Wrote file object to browser filesystem in ${tock - tick} ms`)
    } else console.error(`[hdf5-io]: Failed to write file:`, name)
  }

  close = (name = [...this.files.keys()][0]) => {
    const fileObj = this.files.get(name)
    if (fileObj) {
      if (fileObj.reader) fileObj.reader.close()
      this.files.delete(name)
    }
  }
}