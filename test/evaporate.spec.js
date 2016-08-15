import chai from 'chai'
import chaiSinon from 'sinon-chai'
import sinon from 'sinon'
import test from 'ava'

import document from './mock/document.mock'

import Evaporate from '../evaporate'

chai.use(chaiSinon)
const expect = chai.expect

const baseConfig = {
  signerUrl: 'http://what.ever/sign',
  aws_key: 'testkey',
  bucket: 'testbaket',
  logging: false
}

const baseAddConfig = {
  name: 'testname',
  file: 'testfile'
}

test.before(() => {
  global.XMLHttpRequest = sinon.useFakeXMLHttpRequest()
  global.Blob = ArrayBuffer
  global.File = ArrayBuffer
  global.document = document
})

test('should work', () => {
  expect(true).to.be.ok
})

// constructor

test('should return supported instance', () => {
  const evaporate = new Evaporate(baseConfig)

  expect(evaporate.supported).to.be.ok
})

test('should return supported instance with public functions', () => {
  const evaporate = new Evaporate(baseConfig)
  const publicFunctionNames = [
    'add',
    'cancel',
    'pause',
    'resume',
    'forceRetry'
  ]

  publicFunctionNames.forEach((functionName) => {
    expect(evaporate[functionName]).to.be.instanceof(Function)
  })
})

test('should not return supported instance with public functions', () => {
  const emptyConfig = {}
  const evaporate = new Evaporate(emptyConfig)
  const publicFunctionNames = [
    'add',
    'cancel',
    'pause',
    'resume',
    'forceRetry'
  ]

  // expect(evaporate.supported).to.not.be.ok
  publicFunctionNames.forEach((functionName) => {
    expect(evaporate[functionName]).to.equal(undefined)
  })
})

// add

test('should fail to add() when no file is present', () => {
  const evaporate = new Evaporate(baseConfig)
  const result = evaporate.add()

  expect(result).to.equal('Missing file')
})

test('should fail to add() when empty config is present', () => {
  const evaporate = new Evaporate(baseConfig)
  const emptyConfig = {}
  const result = evaporate.add(emptyConfig)

  expect(result).to.equal('Missing attribute: name  ')
})

test('should add() new upload with correct config', () => {
  const evaporate = new Evaporate(baseConfig)
  const id = evaporate.add(baseAddConfig)

  expect(id).to.equal(0)
})

test('should add() two new uploads with correct config', () => {
  const evaporate = new Evaporate(baseConfig)
  const id0 = evaporate.add(baseAddConfig)
  const id1 = evaporate.add(baseAddConfig)

  expect(id0).to.equal(0)
  expect(id1).to.equal(1)
})

test.skip('should call a callback on successful add()', () => {
  const evaporate = new Evaporate(baseConfig)
  const config = Object.assign({}, baseConfig, {
    started: sinon.spy()
  })
  const id = evaporate.add(baseAddConfig)

  expect(config.started).to.have.been.called
  expect(config.started).to.have.been.calledWithExactly(id)
})

// cancel

test('should fail to cancel() when no id is present', () => {
  const evaporate = new Evaporate(baseConfig)
  const result = evaporate.cancel()

  expect(result).to.not.be.ok
})

test('should fail to cancel() when non-existing id is present', () => {
  const evaporate = new Evaporate(baseConfig)
  const result = evaporate.cancel(42)

  expect(result).to.not.be.ok
})

test('should cancel() an upload with correct id', () => {
  const evaporate = new Evaporate(baseConfig)
  const id = evaporate.add(baseAddConfig)
  const result = evaporate.cancel(id)

  expect(result).to.be.ok
})

test('should cancel() two uploads with correct id', () => {
  const evaporate = new Evaporate(baseConfig)
  const id0 = evaporate.add(baseAddConfig)
  const id1 = evaporate.add(baseAddConfig)
  const result0 = evaporate.cancel(id0)
  const result1 = evaporate.cancel(id1)

  expect(result0).to.be.ok
  expect(result1).to.be.ok
})

test('should call a callback on cancel()', () => {
  const evaporate = new Evaporate(baseConfig)
  const config = Object.assign({}, baseAddConfig, {
    cancelled: sinon.spy()
  })
  const id = evaporate.add(config)
  const result = evaporate.cancel(id)

  expect(result).to.be.ok
  expect(config.cancelled).to.have.been.called
})

test('should call a callback on pause()', () => {
  const evaporate = new Evaporate(baseConfig)
  const config = Object.assign({}, baseAddConfig, {
    pausing: sinon.spy(),
    paused: sinon.spy()
  })
  const id = evaporate.add(config)
  evaporate.pause(id)

  expect(config.pausing).to.have.been.called
})

test('should call a callback on pause() with force option', () => {
  const evaporate = new Evaporate(baseConfig)
  const config = Object.assign({}, baseAddConfig, {
    pausing: sinon.spy(),
    paused: sinon.spy()
  })
  const id = evaporate.add(config)
  evaporate.pause(id, { force: true })

  expect(config.paused).to.have.been.called
})

test('should call a callback on resume()', () => {
  const evaporate = new Evaporate(baseConfig)
  const config = Object.assign({}, baseAddConfig, {
    pausing: sinon.spy(),
    paused: sinon.spy(),
    resumed: sinon.spy()
  })
  const id = evaporate.add(config)
  evaporate.pause(id, { force: true })
  evaporate.resume(id)

  expect(config.paused).to.have.been.called
  expect(config.resumed).to.have.been.called
})
