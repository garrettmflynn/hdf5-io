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

## Open Questions
0. Files of at least 1.8MB give memory overload errors when trying to save...
    - Can we manipulate a writable version of the HDF5 file directly? Creating existing attributes and datasets is currently unacceptable.
1. `.specloc` is not rewritten as an object reference
2. I have commented out the line with `data.map(BigInt)` to `output = data.map(bnToBuf);`([src](https://coolaj86.com/articles/convert-js-bigints-to-typedarrays/)) in  `node_modules/h5wasm/dist/esm/hdf5_hl.js` because you can't have a BigInt in a TypedArray that isn't specifically for them...
    - Generally BigInt write support is very poor in [h5wasm]
    - **Note:** This only happens when providing the dtype into the creation function...
3. Most of the time, attributes are not written with the same type as they were at the beginning (e.g. from 64-bit floating-point to 32-bit integer). **Is this a problem?**

## Limitations
1. We have been experiencing issues compiling for use in Node.js using tinybuild. As such, this library is **currently only available for use in the browser**.

## Acknowledgments
**hdf5-io** was originally prototyped by [Garrett Flynn](https;//github.com/garrettmflynn) as the [**WebNWB**](https;//github.com/brainsatplay/WebNWB) project at the [2022 NWB-DANDI Remote Developer Hackathon](https://neurodatawithoutborders.github.io/nwb_hackathons/HCK12_2022_Remote/).
