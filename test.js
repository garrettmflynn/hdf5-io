import './tests/node/polyfill.js' // There's an issue with tinybuild where it expects to have a Blob class but doesn't provide it in Node.js
import * as hdf5 from './dist/index.es.js';

const io = new hdf5.HDF5IO()
io.initFS('hdf5-test').then(async () => {
    const res = await io.load('https://raw.githubusercontent.com/OpenSourceBrain/NWBShowcase/master/FergusonEtAl2015/FergusonEtAl2015.nwb')
    if (res) {
        const saved = await io.save(res)
        const list = await io.list()
        console.log('List', list.includes(saved), list)
    } else console.error('File not properly loaded')
})

