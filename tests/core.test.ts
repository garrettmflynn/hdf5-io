import fs from 'fs'
import { beforeAll, describe, expect, test } from 'vitest';

import * as hdf5 from '../src/index';
let io = new hdf5.HDF5IO()

// // NOTE: The distribution messes with all of the file management for h5wasm
// import * as hdf5 from '../dist/index.es';
// import * as h5 from "h5wasm"; // NOTE: Have to load this externally for distribution
// let io = new hdf5.HDF5IO({ h5 })

const saveDir = 'hdf5-test'

const newFile = 'test.hdf5'
const existingFile = '../files/FergusonEtAl2015.nwb' // Relative to base directory
const url = 'https://raw.githubusercontent.com/OpenSourceBrain/NWBShowcase/master/FergusonEtAl2015/FergusonEtAl2015_PYR5_rebound.nwb'

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


const newDataset = 'This is a new dataset'
const newAttribute = 'This is a new attribute'
const newMetadata = 'This is new metadata'

describe(`Can read and write HDF5 files using JavaScript objects`, () => {

  beforeAll(async () => {
    if (fs.existsSync(saveDir)) fs.rmSync(saveDir, { recursive: true }) // Delete any existing test directory
    await io.initFS(saveDir) // initialize local filesystem
  })

  test('existing file can be loaded', async () => {
    const loaded = await io.load(existingFile)
    expect(loaded.acquisition).toBeInstanceOf(Object) // Acquisition is an object
    expect(loaded.nwb_version).toBeInstanceOf(String) // Version is an object
  })

  test('object can be saved in local filesystem', async () => await io.save(file, newFile))

  test('custom file can be loaded', async () => {
    const savedFile = await io.load(newFile)
    expect(savedFile).toBeInstanceOf(Object) // File is an object
    const thisKeys = Object.keys(savedFile)
    Object.keys(file).forEach(key => expect(thisKeys).toContain(key)) // Should have same keys as original file
    // io.close()


    expect(savedFile.attribute?.valueOf()).toEqual(file.attribute) // File attribute is correct
    expect(savedFile.dataset?.valueOf()).toEqual(file.dataset?.valueOf()) // File dataset is correct
    expect(savedFile.group.attribute?.valueOf()).toEqual(file.group.attribute) // File group attribute is correct
    expect(savedFile.group.dataset?.valueOf()).toEqual(file.group.dataset?.valueOf()) // File group dataset is correct
    expect(savedFile.dataset.metadata?.valueOf()).toEqual(dataset.metadata) // File dataset metadata is correct
  })

  test('new attribute can be saved', async () => {
    const toChange = await io.load(newFile)
    toChange.newAttribute = newAttribute
    const savedName = await io.save(toChange)
    expect(savedName).toBe(newFile) // File has been saved
    const savedFile = await io.load(savedName)
    expect(savedFile.newAttribute?.valueOf()).toEqual(newAttribute)
  })

  test('new dataset can be saved', async () => {
    const toChange = await io.load(newFile)
    toChange.newDataset = new String(newDataset)
    toChange.newDataset.metadata = newMetadata
    const savedFile = await io.load(await io.save(toChange))
    const dataset = savedFile.newDataset
    expect(dataset.valueOf()).toEqual(newDataset)
    expect(dataset.metadata.valueOf()).toEqual(newMetadata)
  })

  test('new group can be saved', async () => {
    const toChange = await io.load(newFile)
    toChange.newGroup = {}
    const savedFile = await io.load(await io.save(toChange))
    expect(savedFile.newGroup).toBeInstanceOf(Object) // Group is an object
  })

  test('old attribute can be updated', async () => {
    const toChange = await io.load(newFile)
    toChange.attribute = newAttribute
    const savedFile = await io.load(await io.save(toChange))
    expect(savedFile.attribute?.valueOf()).toEqual(newAttribute)
  })

  test('old dataset can be updated', async () => {
    const toChange = await io.load(newFile)
    toChange.dataset = newDataset
    toChange.dataset.metadata = newMetadata
    const savedFile = await io.load(await io.save(toChange))
    const dataset = savedFile.dataset
    expect(dataset.valueOf()).toEqual(newDataset)
    expect(dataset.metadata.valueOf()).toEqual(newMetadata)
  })

  test('old dataset metadata can be updated', async () => {
    const toChange = await io.load(newFile)
    toChange.dataset.metadata = `[new]: ${newMetadata}`
    const savedFile = await io.load(await io.save(toChange))
    const dataset = savedFile.dataset
    expect(dataset.metadata.valueOf()).toEqual(newMetadata)
  })

  test('old group can be updated', async () => {
    const toChange = await io.load(newFile)
    const dataset = new String(newDataset)
    dataset.metadata = newMetadata
    toChange.group = { newAttribute, newDataset: dataset }
    const savedFile = await io.load(await io.save(toChange))
    const group = savedFile.group
    expect(Object.keys(group)).toEqual(['newDataset', 'newAttribute']) // Cleared all keys
    expect(group.newAttribute?.valueOf()).toEqual(newAttribute)
    expect(group.newDataset.valueOf()).toEqual(newDataset)
    expect(group.newDataset.metadata.valueOf()).toEqual(newMetadata)
  })



  // let fileStringified: string
  test('remote file can be loaded into the filesystem', async () => {
    const file = await io.load(url)
    expect(file.nwb_version).toBeInstanceOf(String)
    expect(file.acquisition).toBeInstanceOf(Object)
    // fileStringified = JSON.stringify(file)
  })

  // // NOTE: Workers not working in Node.js
  // test('remote file can be streamed', async () => {
  //   const file = await io.load(url, { useStreaming: true })
  //   expect(file.nwb_version).toBeInstanceOf(String)
  //   expect(file.acquisition).toBeInstanceOf(Object)
  //   // expect(fileStringified).toEqual(JSON.stringify(file)) // File is an object
  // }, 10 * 1000)

})