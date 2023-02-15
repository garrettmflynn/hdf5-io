import * as hdf5 from '../src/index';
import fs from 'fs'
import process from 'process'
// NOTE: These are only provisional tests to ensure that the library is working in Node.js. 
// They will be replaced with more comprehensive tests in the future.

describe(`Can create an IO object`, () => {

// Initialize HDF5IO instance (all optional parameters
let io: any;

beforeAll(() => {
  const dir = 'hdf5-test'
  const fulldir = `${process.cwd()}/${dir}`
  if (fs.existsSync(fulldir)) fs.rmSync(fulldir, { recursive: true }) // Delete any existing test directory
  io = new hdf5.HDF5IO()
  io.initFS(dir) // initialize local filesystem // NOTE: This errors on fs.mkdir
})


const name = 'FergusonEtAl2015'
const filename = `${name}.nwb`

test('file can be created in local filesystem', async () => {

  // NOTE: Missing check for typed groups
  const file = { 
    attribute: 'this is an attribute',
    dataset: new String('this is a dataset'),
    group: {
      attribute: 'this is an attribute',
      dataset: new String('this is a dataset'),
    }
  }

  // const file = io.load(filename) // Use load before created to create

  await io.save(file, filename) // Save the object as a file

  // Check saved file
  const savedFile = await io.load(filename)
  expect(savedFile).toBeInstanceOf(Object) // File is an object
  expect(savedFile.attribute?.valueOf()).toBe(file.attribute) // File attribute is correct
  expect(savedFile.dataset).toEqual(file.dataset) // File dataset is correct
  expect(savedFile.group.attribute?.valueOf()).toBe(file.group.attribute) // File group attribute is correct
  expect(savedFile.group.dataset).toEqual(file.group.dataset) // File group dataset is correct
})

test('remote file can ovewrite file in local filesystem', async () => {
  const file = await io.load(`https://raw.githubusercontent.com/OpenSourceBrain/NWBShowcase/master/${name}/${filename}`)
  const files = await io.list()
  expect(file).toBeInstanceOf(Object) // File is an object
  expect(files).toContain(filename) // File has been created in filesystem
})

// NOTE: Streaming not supported in Node.js
// test('remote file can be streamed', async () => {
//   const file = await io.load(`https://raw.githubusercontent.com/OpenSourceBrain/NWBShowcase/master/${name}/${filename}`, { useStreaming: true })
//   expect(file).toBeInstanceOf(Object) // File is an object
// })

test('local file can be loaded', async () => {
  const file = await io.load(filename)
  expect(file).toBeInstanceOf(Object) // File is an object
})

test('changes to local file can be saved', async () => {
  const file = await io.load(filename)
  expect(file).toBeInstanceOf(Object) // File is an object
  const newDescription = 'This is a new description'
  file.session_description = newDescription

  // NOTE: Currently compiles down. Doesn't make changes on the existing file...
  const savedName = await io.save(file)
  expect(savedName).toBe(filename) // File has been saved
  const savedFile = await io.load(savedName)
  expect(savedFile.session_description.valueOf()).toBe(newDescription) // File changes have been registered
})

})