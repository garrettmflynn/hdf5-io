import * as hdf5 from '../src/index';
describe(`Can create an IO object`, () => {

// Initialize HDF5IO instance (all optional parameters
let io: any;

beforeAll(async () => {
  await hdf5.ready
  io = new hdf5.HDF5IO( { debug: true } )
})

test('instantiated file is an object', () => {
  expect(io).toBeInstanceOf(Object)
})
// await io.initFS('/hdf5-test') // initialize local filesystem

// // load a remote file
// const file = await io.fetch(
//      'https://raw.githubusercontent.com/OpenSourceBrain/NWBShowcase/master/FergusonEtAl2015/FergusonEtAl2015.nwb', // URL to get file from
//     'FergusonEtAl2015.nwb',  // Save the file with this name
//     (ratio) => console.log('Load Status', `${(ratio * 100).toFixed(2)}%`),
//     (remote) => console.log('Origin', (remote) ? path : 'Local')
// )

// // save the file to local storage
// io.save()

// // list files in local storage
// const files = await io.list()

// // get specific file from local storage
// const lsFile = await io.read(filename)


})