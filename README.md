# hdf5-io
Simple Utility for Reading / Writing HDF5 Files

![status](https://img.shields.io/npm/v/hdf5-io) 
![downloads](https://img.shields.io/npm/dt/hdf5-io)
![lic](https://img.shields.io/npm/l/hdf5-io)

> Note: [h5wasm](https://github.com/usnistgov/h5wasm) was difficult to bundle with Rollup, so it's required as an argument to the `HDF5IO` class.

## Getting Started

``` javascript 

// Import Peer Dependency
import * as hdf5 from "https://cdn.jsdelivr.net/npm/h5wasm@latest/dist/esm/hdf5_hl.js";

// Import hdf5-io Library
import HDF5IO from "https://cdn.jsdelivr.net/npm/hdf5-io/dist/index.esm.js";

// Create HDF5IO Arguments

const args = [

   // Provide h5wasm module
    hdf5,    
    
    // Provide preprocess and postprocess (optional)
    {
        preprocess: (hdf5File) => hdf5File, // preprocess HDF5 file
        postprocess: (hdf5Object) => hdf5Object // Modify HDF5 file object before returning
    },
    
    // Toggle Debugging (optional)
    true 
    
]

// Initialize HDF5IO Instance
const io = new HDF5IO(...args)

// Grab a published NWB File (hdf5 backend) from a remote endpoint
const path = 'https://raw.githubusercontent.com/OpenSourceBrain/NWBShowcase/master/FergusonEtAl2015/FergusonEtAl2015.nwb'
io.fetch(path, 'file.nwb').then(console.log)
```
## Acknowledgments
**hdf5-io** was originally prototyped by [Garrett Flynn](https;//github.com/garrettmflynn) adjacent to the [**jsnwb**](https;//github.com/brainsatplay/jsnwb) project at the [2022 NWB-DANDI Remote Developer Hackathon](https://neurodatawithoutborders.github.io/nwb_hackathons/HCK12_2022_Remote/).
