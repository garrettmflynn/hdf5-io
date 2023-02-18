import './setBlob.js' // There's an issue with tinybuild where it expects to have a Blob class but doesn't provide it in Node.js
import * as hdf5 from '../../dist/index.esm.js';
import * as h5 from 'h5wasm'

const name = 'FergusonEtAl2015'
const filename = `${name}.nwb`


// This standalone version of the Jest test works just fine...
const run = async () => {
    const io = new hdf5.HDF5IO({
        // reader: h5 // Ensure all is accessible...
    })
    await io.initFS('hdf5-test') // initialize local filesystem // NOTE: This errors on fs.mkdir

//       // NOTE: Missing check for typed groups
//   const file = { 
//     attribute: 'this is an attribute',
//     dataset: new String('this is a dataset'),
//     group: {
//       attribute: 'this is an attribute',
//       dataset: new String('this is a dataset'),
//     }
//   }

//   // const file = io.load(filename) // Use load before created to create

//   await io.save(file, filename) // Save the object as a file


    const file = await io.load(`https://raw.githubusercontent.com/OpenSourceBrain/NWBShowcase/master/${name}/${filename}`)
    await io.save(file)
    const files = await io.list()

    console.log('files', !!file, !!file.acquisition, files)
    if (!file.acquisition) console.error('No Acquisition', file)
}

run()