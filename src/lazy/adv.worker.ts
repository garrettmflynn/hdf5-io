import { File, ready, Group, Dataset, BrokenSoftLink, ExternalLink, Attribute } from "h5wasm";
import  { createLazyFile } from './lazyFileLRU';
import * as global from './global'

declare var self: MyWorkerGlobalScope;
interface MyWorkerGlobalScope extends Worker {
    file: File;
    import: object;
}
var file: File;

function getAttr (key: string, parent: {[x:string]: any}) {
    let attr = Object.assign({}, parent[key])
    attr.value = parent[key].value
    return attr
}


self.onmessage = async function (event) {
    const { action, payload } = event.data;
    const id = event.data[global.id]

    if (action === "load") {
        const url = payload?.url;
        if (!url) {
            console.error('No url provided')
            self.postMessage({[global.id]: id, payload: false})
        } else {
            const requestChunkSize = payload?.requestChunkSize ?? 1024 * 1024;
            const LRUSize = payload?.LRUSize ?? 50;
            const { FS } = await ready;
            const config = {
                rangeMapper: (fromByte: number, toByte: number) => ({url, fromByte, toByte}),
                requestChunkSize,
                LRUSize,
                callbacks: {
                    progressCallback: (ratio, length, id) => {
                        self.postMessage({[global.id]: id, type: 'progress', payload: {ratio, length, id}})
                    },
                    successCallback: () => {
                        self.postMessage({[global.id]: id, type: 'success', payload: true})
                    }
                }
            }
            //hdf5.FS.createLazyFile('/', "current.h5", DEMO_FILEPATH, true, false);
            await createLazyFile(FS, '/', 'current.h5', true, false, config);
            file = new File("current.h5");
            self.postMessage({[global.id]: id, payload: true})
        }
    }
    else if (action === "get") {
        await ready;
        if (file) {

            let newPayload: any = {}

            const path = payload?.path ?? "entry";
            const item = file.get(path);

            // Transfer value from attrs
            let attrs = {};
            if (item?.attrs) {
                for (let key in item.attrs) attrs[key] = getAttr(key, item.attrs)
            }


            if (item instanceof Group) {
                newPayload = {
                    type: item.type,
                    attrs,
                    children: [...item.keys()] 
                };
            } else if (item instanceof Dataset) {

                const value = (payload.slice) ? item.slice(payload.slice) : item.value;
                newPayload = {
                    type: item.type,
                    attrs,
                    value
                }
            } else if (item instanceof BrokenSoftLink || item instanceof ExternalLink) newPayload = item
            else {
                newPayload = {
                    type: "error",
                    value: `item ${path} not found`,
                }
            }

            self.postMessage({[global.id]: id, payload: newPayload})
        }
    }
  };

  export default self as any;

