# hdf5-io
Simple utility for reading / writing HDF5 files on the browser

![status](https://img.shields.io/npm/v/hdf5-io) 
![downloads](https://img.shields.io/npm/dt/hdf5-io)
![lic](https://img.shields.io/npm/l/hdf5-io)

## Description
**hdf5-io** is a simple utility for handling reading / writing HDF5IO files. As an extension to the **h5wasm** library, it immediately emits and consumes JavaScript objects containing all the relevent data.

## Getting Started

``` javascript 

// Import hdf5-io Library
import HDF5IO from "https://cdn.jsdelivr.net/npm/hdf5-io/dist/index.esm.js";

// Initialize HDF5IO instance (all optional parameters)
const io = new HDF5IO(
    {
        postprocess: (hdf5Object) => hdf5Object,
        debug: true
    },
    
)

await io.initFS('/hdf5-test') // initialize local filesystem

// load a remote file
const file = await io.fetch(
     'https://raw.githubusercontent.com/OpenSourceBrain/NWBShowcase/master/FergusonEtAl2015/FergusonEtAl2015.nwb', // URL to get file from
    'FergusonEtAl2015.nwb',  // Save the file with this name
    (ratio) => console.log('Load Status', `${(ratio * 100).toFixed(2)}%`),
    (remote) => console.log('Origin', (remote) ? path : 'Local')
)

// save the file to local storage
const filename = io.save(file)

// list files in local storage
const files = await io.list()

// get specific file from local storage
const lsFile = await io.load(filename)

```

## Conventions
### Datasets
When reading an HDF5 file, both datasets and attributes are transformed into JavaScript objects that hold their respective metadata:
```javascript
const datasetValue = 1 // From HDF5 file
const output = new Number(datasetValue)
```

If you are adding a new dataset, this **must** be an Object when written to the file:
```javascript
const object = {
    dataset: new Number(1),
    attribute: 1
}
```

## Known Issues
- Files that previous could be streamed (e.g. https://dandiarchive.s3.amazonaws.com/blobs/aff/5f6/aff5f64d-9a69-4ff3-a6fe-13a3f30dca50) no longer work
- Node.js doesn't work when bundled—unless you manually provide a `h5wasm` instance
- Streaming doesn't work in Node.js

## Acknowledgments
**hdf5-io** was originally prototyped by [Garrett Flynn](https;//github.com/garrettmflynn) as the [**WebNWB**](https;//github.com/brainsatplay/WebNWB) project at the [2022 NWB-DANDI Remote Developer Hackathon](https://neurodatawithoutborders.github.io/nwb_hackathons/HCK12_2022_Remote/).
