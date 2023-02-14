import * as hdf5 from '../src/index';

// NOTE: These are only provisional tests to ensure that the library is working in Node.js. 
// They will be replaced with more comprehensive tests in the future.

describe(`Can create an IO object`, () => {

// Initialize HDF5IO instance (all optional parameters
let io: any;

beforeAll(async () => {
  await hdf5.ready
  io = new hdf5.HDF5IO( { 
    // debug: true 
  } )
  // io.initFS('/hdf5-test') // initialize local filesystem // NOTE: This errors on fs.mkdir
})

test('instantiated file is an object', () => {
  expect(io).toBeInstanceOf(Object)
})

test('can load a remote file', async () => {

  const file = await io.fetch(
        'https://raw.githubusercontent.com/OpenSourceBrain/NWBShowcase/master/FergusonEtAl2015/FergusonEtAl2015.nwb', // URL to get file from
      // 'FergusonEtAl2015.nwb',  // Save the file with this name
  )

  const files = await io.list()
  console.log('Files', files)


  // // save the file to local storage
  // io.save(file)

  expect(file).toBeInstanceOf(Object)
})

// // save the file to local storage
// io.save(file)

// // list files in local storage
// const files = await io.list()

// // get specific file from local storage
// const lsFile = await io.load(filename)


})