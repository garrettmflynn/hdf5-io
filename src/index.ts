import * as h5wasm from "h5wasm";
import FileProxy, { FileProxyOptions } from "./lazy/FileProxy";
import { Callbacks } from "./types";

export type ArbitraryObject = {[x:string]: any}

export type IOInput = {
  debug?: boolean,
  postprocess?: Function,
  case?: caseUtils.CaseType
}

import * as arrayUtils from './utils/array'
import * as caseUtils from './utils/case'

type FetchOptions = {
  useLocalStorage?: boolean | FileProxyOptions,
  useStreaming?: boolean,
} & Callbacks

export default class HDF5IO {

  reader: any;
  files: Map<string, {
    name: string,
    // read?: any,
    // write?: any,
    file?: any
    reader?: any
  }> = new Map();

  _path: string = "/hdf5-io"
  _debug: boolean;
  _postprocess: Function = (o:any) => o // Returns processed file object

  _extension: string = 'hdf5'
  _mimeType: string = 'application/x-hdf5'

  case: caseUtils.CaseType = 'snake' // 'camel', 'snake', or 'pascal'

  constructor(options:IOInput={}) {
    this.reader = h5wasm;
    this._debug = options.debug ?? false;
    if (options?.postprocess) this._postprocess = options.postprocess
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


    this.reader.ready.then(async () => {

      this.reader.FS.mkdir(path);
      this.reader.FS.chdir(path);

      try {
        // Create a local mount of the IndexedDB filesystem:
        this.reader.FS.mount(this.reader.FS.filesystems.IDBFS, {}, path)
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

      this.reader.ready.then(async () => {
        if (this._debug && !read) console.log(`[hdf5-io]: Pushing all current files in ${path} to IndexedDB`)
        this.reader.FS.syncfs(read, async (e?:Error) => {
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

    await this.reader.ready
    let node;

    try {node = (this.reader.FS.lookupPath(path))?.node} 
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
    return this.reader.FS.readFile(file.name)
}

  // Allow Download of NWB-Formatted HDF5 Files from the Browser
  download = (name: string, file?: any, extension: string = this._extension) => {
    if (!file) file = (name) ? this.files.get(name) : [...this.files.values()][0]
    if (file) {
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
  stream = (name: string, options?: FileProxyOptions, callbacks?: Callbacks) => {
      const proxy = new FileProxy(name, options, callbacks)
      this.files.set(name, {name, file: proxy}) // undefined === capable of being loaded
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
      const streamObject = await this.stream(url, typeof options.useStreaming === 'object' ? options.useStreaming : undefined,{
        successCallback:  options.successCallback,
        progressCallback: options.progressCallback,
      })

      if (streamObject !== null) {

        console.warn(`Streaming the specification for ${filename}`)
        const specifications = await streamObject.specifications
        await this.resolveStream(specifications)
        o.file = this._postprocess(streamObject)//, false)
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
      await this.reader.ready
      this.reader.FS.writeFile(name, new Uint8Array(ab));
      const tock = performance.now()
      if (this._debug) console.log(`[hdf5-io]: Wrote raw file in ${tock - tick} ms`)
      return true
  }

  // Parse File Information with HDF5 Knowledge
  // NOTE: This is replicated in the streaming version...so there are two sets of code doing this...
  parse = (o: any, aggregator: { [x: string]: any } = {}, key: string, keepDatasets:boolean = true) => {

          if (o){

          // Datasets
          if (o instanceof this.reader.Dataset) {
            if (Object.keys(aggregator[key])) {
              // ToDO: Expose HDF5 Dataset objects
              // if (keepDatasets) aggregator[key] = o // Expose HDF5 Dataset
              // else 
              aggregator[key] = o.value
            }
            else aggregator[key] = o.value
  
            
          } 
          
          // Attributes
          else if (!o.attrs.value) {
            for (let a in o.attrs) {
              aggregator[key][a] = o.attrs[a].value // Exclude shape and dType
            }
          }
  
          // Drill Group
          if (o.keys instanceof Function) {
            let keys = o.keys()

            keys.forEach((k: string) => {
              const group = o.get(k)
              aggregator[key][k] = {}
              aggregator[key][k] = this.parse(group, aggregator[key], k, keepDatasets)
            })
          }

          }
  
          return aggregator[key]
        }

  // ---------------------- Core HDF5IO Methods ----------------------
  read = (name = [...this.files.keys()][0], useLocalStorage: boolean = true) => {

    let file = this.get(name, 'r', useLocalStorage)

    if (Number(file?.reader?.file_id) != -1) {

      const tick = performance.now()

      // Parse the data using the modifier
      let innerKey = 'res'
      let aggregator:ArbitraryObject = {[innerKey]: {}}
      this.parse(file.reader, aggregator, innerKey)

      // Postprocess the data using an arbitrary function
      file.file = this._postprocess(aggregator[innerKey])

      const tock = performance.now()
      if (this._debug) console.log(`[hdf5-io]: Read file in ${tock - tick} ms`)
      return file.file

    } else {
      console.error(`[hdf5-io]: File ${name} not found`)
      return
    }
  }

  // Get File by Name
  get = (name: string = [...this.files.keys()][0], mode?: string, useLocalStorage: boolean = true ) => {

    let o = this.files.get(name)

    if (!o) {
      o = { name, file: null, reader: null}
      this.files.set(name, o)
    }

    if (mode) {

      if (o.reader?.mode !== mode) {
        if (o.reader) o.reader.close() // Maintain only one open reader for a particular file 

        let hdf5 = new this.reader.File(name, mode);
        if (mode === 'w') o.reader = hdf5
        else if (mode === 'r') o.reader = hdf5
        else if (mode === 'a') o.reader = hdf5
      }
    } else if (useLocalStorage && (name && o.file === undefined)) {
      if (this._debug) console.log(`[hdf5-io]: Returning local version from ${this._path}`)
      this.read(name)
    }

    return o
  }

  save = (path:string = this._path) => {
    console.warn('[hdf5-io]: Saving file', path)
    this.syncFS(false, path)
  }

  write = (o: ArbitraryObject, name = [...this.files.keys()][0]) => {

    let file = this.get(name, 'w')
    console.log('[hdf5-io]: Writing file', name, file)

    if (Number(file?.reader?.file_id) != -1) {

      const tick = performance.now()

      // Write Arbitrary Object to HDF5 File
      let writeObject = (o: any, key?: String) => {
        const group = (key) ? file.reader.get(key) : file.reader
        for (let k in o) {

          const snakeKey = this.case ? caseUtils.set(k, this.case) : k // Keep original key if not set

          const newKey = `${(key) ? `${key}/` : ''}${snakeKey}` // ASSUMPTION: Spec uses snake case

          // Don't save methods
          if (!(typeof o[k] === 'function')) {

            if (o[k] && typeof o[k] === 'object') {

              // Dataset
              if (arrayUtils.check(o[k])) {
                group.create_dataset(snakeKey, o[k]);
              } 
              
              // Group
              else {
                file.reader.create_group(newKey);
                writeObject(o[k], newKey)
              }
              // }
            } else {
              if (o[k]) group.create_attribute(snakeKey, o[k]);
            }
          }
        }
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