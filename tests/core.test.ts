// NOTE: These are only provisional tests to ensure that the library is working in Node.js. 
// They will be replaced with more comprehensive tests in the future.

import fs from 'fs'
import process from 'process'


// import './node/setBlob' // There's an issue with tinybuild where it expects to have a Blob class but doesn't provide it in Node.js
// import * as hdf5 from '../dist/index.esm';

import * as hdf5 from '../src/index';

describe(`Can read and write HDF5 files using JavaScript objects`, () => {

// Initialize HDF5IO instance (all optional parameters
let io: any;

const dir = 'hdf5-test'
const fulldir = `${process.cwd()}/${dir}`

beforeAll(async () => {
  if (fs.existsSync(fulldir)) fs.rmSync(fulldir, { recursive: true }) // Delete any existing test directory

  io = new hdf5.HDF5IO()
  await io.initFS(dir) // initialize local filesystem // NOTE: This errors on fs.mkdir

  // const file = await io.load(filename)
  // console.log('Test Previous Fetched', file, path)

})


const name = 'FergusonEtAl2015'
const filename = `${name}.nwb`


const dataset = new String('this is a dataset') as any
dataset.metadata = 'this is a dataset metadata'

  // NOTE: Missing check for typed groups
let file = { 
  attribute: 'this is an attribute',
  dataset: dataset,
  group: {
    attribute: 'this is an attribute',
    dataset: new String('this is a dataset'),
  }
}

test('object can be saved in local filesystem', async () => await io.save(file, filename))

test('local file can be loaded', async () => {
  const savedFile = await io.load(filename)
  expect(savedFile).toBeInstanceOf(Object) // File is an object
  expect(savedFile.attribute?.valueOf()).toEqual(file.attribute) // File attribute is correct
  expect(savedFile.dataset?.valueOf()).toEqual(file.dataset?.valueOf()) // File dataset is correct
  expect(savedFile.group.attribute?.valueOf()).toEqual(file.group.attribute) // File group attribute is correct
  expect(savedFile.group.dataset?.valueOf()).toEqual(file.group.dataset?.valueOf()) // File group dataset is correct
  expect(savedFile.dataset.metadata?.valueOf()).toEqual(dataset.metadata) // File dataset metadata is correct
})

test('changes to local file can be saved', async () => {
  const toChange = await io.load(filename)
  const thisKeys = Object.keys(toChange)
  Object.keys(file).forEach(key => expect(thisKeys).toContain(key)) // Should have same keys as original file
  expect(toChange).toBeInstanceOf(Object) // File is an object

  // Declare changes
  const newDataset = 'This is a new dataset'
  const newAttribute = 'This is a new attribute'
  const newMetadata = 'This is new metadata'

  // Declare Dataset and Attribute changes
  toChange.dataset = newDataset // This knows it is a dataset now
  toChange.dataset.metadata = newMetadata
  toChange.attribute = newAttribute
  toChange.group.dataset = newDataset
  toChange.group.attribute = newAttribute

  const savedName = await io.save(toChange)
  expect(savedName).toBe(filename) // File has been saved
  const savedFile = await io.load(savedName)

  // File changes have been registered
  expect(savedFile).toBeInstanceOf(Object) // File is an object
  Object.keys(savedFile).forEach(key => expect(thisKeys).toContain(key)) // Should have same keys as original File
  expect(savedFile.dataset?.valueOf()).toEqual(newDataset)
  expect(savedFile.dataset.metadata?.valueOf()).toEqual(newMetadata)
  expect(savedFile.attribute?.valueOf()).toEqual(newAttribute)
  expect(savedFile.group.dataset?.valueOf()).toEqual(newDataset)
  expect(savedFile.group.attribute?.valueOf()).toEqual(newAttribute)

})

test('remote file can ovewrite file in local filesystem', async () => {
  // try { fs.unlinkSync(path.join(fulldir, filename)) } catch (e) { } // This allows the test to be run successfully
  const file = await io.load(`https://raw.githubusercontent.com/OpenSourceBrain/NWBShowcase/master/${name}/${filename}`)
  expect(file.acquisition).toBeInstanceOf(Object) // File is an object
  expect(file.nwb_version).toBeInstanceOf(Object) // File is an object

})

// // // NOTE: Workers not supported in Jest
// // test('remote file can be streamed', async () => {
// //   const file = await io.load(`https://raw.githubusercontent.com/OpenSourceBrain/NWBShowcase/master/${name}/${filename}`, { useStreaming: true })
// //   expect(file).toBeInstanceOf(Object) // File is an object
// // })


})