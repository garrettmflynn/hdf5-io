import HDF5IO from "./src/index";
// import HDF5IO from "./dist/index.es";

// const HDF5IO = hdf5.default

import * as visualscript from 'visualscript'

// Initialize HDF5IO Instance
const io = new HDF5IO({
    postprocess: (object: any) => object, // Modify HDF5 file object before returning
    debug: true
})

let editor = new visualscript.ObjectEditor({ readOnly: true})

let file: any;
const uploadButton = document.getElementById('upload') as HTMLButtonElement
uploadButton.onclick = async () => {
    file = await io.load()
    editor.set(file)
}

const downloadButton = document.getElementById('download') as HTMLButtonElement
downloadButton.onclick = async () => {
    if (file){
        try {
            await io.save(file) // Catch memory overloads
        } catch (e) {
            console.warn(`Write error (${e.message}). Trying again with a limit on the number of nested groups...`)
            try {
                await io.save(file) // Catch memory overloads
            } catch (e) {
                console.error(`Write failed...`)
            }
        }
        await io.download(file)
    }
}

// const url = 'https://api.dandiarchive.org/api/assets/29ba1aaf-9091-469a-b331-6b8ab818b5a6/download/'
// io.read(url, { useStreaming: true }).then(async (file) => {
//     console.log('File from DANDI', file)
// })

// // Default demo 
// const run = async () => {
//     await io.initFS('/hdf5-test') // initialize local filesystem

//     // Grab a published NWB File (hdf5 backend) from a remote endpoint
//     const path = 'https://raw.githubusercontent.com/OpenSourceBrain/NWBShowcase/master/FergusonEtAl2015/FergusonEtAl2015.nwb'

//     const filename = 'FergusonEtAl2015.nwb'

//     const file = await io.fetch(
//         path, 
//         filename, 
//         {
//             progressCallback: (ratio) => console.log('Load Status', `${(ratio * 100).toFixed(2)}%`),
//             successCallback: (remote) => console.log('Origin', (remote) ? path : 'Local'),
//             // useStreaming: true
//         }
//     )

//     console.log('File Fetched!', file)

//     io.save()

//     const files = await io.list()
//     console.log('Listed Files', files)

//     const lsFile = await io.read(filename) // get specific file from local storage

//     const equal = JSON.stringify(file) === JSON.stringify(lsFile)
//     console.log('File from local storage is equivalent to original file', equal)

// }

// run()

// create visual object editor
document.body.insertAdjacentElement('beforeend', editor)

let results_el = document.getElementById("results");

const load = document.getElementById("load")
const fileUrl = document.getElementById("file_url") as HTMLInputElement
const size = document.getElementById("LRUSize")  as HTMLInputElement
const chunk = document.getElementById("requestChunkSize") as HTMLInputElement

let lastURL

if (load && fileUrl && size && chunk) load.onclick = function() {
    const url = lastURL = fileUrl.value;
    let LRUSize = parseInt(size.value, 10);
    let requestChunkSize = parseInt(chunk.value, 10);
    io.stream(url, { LRUSize, requestChunkSize }).then((file) => {
        editor.set(file)
    })
}

const get = document.getElementById("get")
const pathEl = document.getElementById("path") as HTMLInputElement
if (get && pathEl) get.onclick = async function() {
    let path = pathEl.value;
    const got =  io.files.get(lastURL)
    if (got?.file) got.file.get(path).then(ondata)
    else console.error('No files with this url available...')
}

function ondata (data) {
    if (results_el) {
        results_el.innerHTML = "";
        const result_text = JSON.stringify(data, (k,v) => {
            if (typeof v === 'bigint') {
                return v.toString();
            }
            else if (ArrayBuffer.isView(v))  {
                return [...v as any];
            }
            return v;
        }, 2);
        results_el.innerText = result_text;
    }
}
