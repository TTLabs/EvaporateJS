import chai, { expect } from 'chai'
import chaiSinon from 'sinon-chai'
import sinon from 'sinon'
import test from 'ava'

import Evaporate from '../evaporate'

import initResponse from './fixtures/init-response'
import completeResponse from './fixtures/complete-response'

chai.use(chaiSinon)

// consts

const CONTENT_TYPE_XML = { 'Content-Type': 'text/xml' }
const CONTENT_TYPE_TEXT = { 'Content-Type': 'text/plain' }

const AWS_BUCKET = 'bucket'
const AWS_UPLOAD_KEY = 'tests'

const baseConfig = {
  signerUrl: 'http://what.ever/sign',
  aws_key: 'testkey',
  bucket: AWS_BUCKET,
  logging: false,
  maxRetryBackoffSecs: 0.1,
  abortCompletionThrottlingMs: 0
}

const baseAddConfig = {
  name: AWS_UPLOAD_KEY,
  file: new File({
    path: '/tmp/file',
    size: 50
  })
}

let server

function randomAwsKey() {
  return Math.random().toString().substr(2) + '_' + AWS_UPLOAD_KEY
}

test.before(() => {
  sinon.xhr.supportsCORS = true
  global.XMLHttpRequest = sinon.useFakeXMLHttpRequest()
  server = sinon.fakeServer.create({
    respondImmediately: true
  })


  server.respondWith('POST', /^.*\?uploads.*$/, (xhr) => {
    xhr.respond(200, CONTENT_TYPE_XML, initResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })
  server.respondWith('PUT', /^.*$/, (xhr) => {
    xhr.respond(200)
  })

  server.respondWith('POST', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(200, CONTENT_TYPE_XML, completeResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })

  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
  })

  server.respondWith('DELETE', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(204)
  })
})

test.beforeEach(() =>{
  localStorage.removeItem('awsUploads')
})

test.after(() => {
  server.restore()
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

test('should not return supported without required options', () => {
  const emptyConfig = {}
  const evaporate = new Evaporate(emptyConfig)
  expect(evaporate.supported).to.equal(false)
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
  return new Evaporate(baseConfig)
      .add(baseAddConfig)
      .then(function (fileKey) {
        let id = fileKey;
        expect(id).to.equal(baseConfig.bucket + '/' + baseAddConfig.name)
      })
})

test('should return fileKeys correctly for common cases started, resolve', () => {
  const evaporate = new Evaporate(baseConfig)

  let config = Object.assign({}, baseAddConfig, {
    started: function (fileKey) { start_id = fileKey; }
  })

  let start_id
  return evaporate.add(config)
      .then(function (fileKey) {
        let expected = baseConfig.bucket + '/' + config.name
        expect(start_id + fileKey).to.equal(expected + expected)
      })
})

test('should return the object key in the complete callback', () => {
  let complete_id

  let config = Object.assign({}, baseAddConfig, {
    complete: function (xhr, name) { complete_id = name;}
  })

  return new Evaporate(baseConfig).add(config)
      .then(function () {
        expect(complete_id).to.equal(config.name)
      })

})

test('should add() two new uploads with correct config', () => {
  let id0, id1

  let config1 = Object.assign({}, baseAddConfig, {
    started: function (fileId) { id0 = fileId; }
  })
  let config2 = Object.assign({}, config1, {
    name: randomAwsKey(),
    started: function (fileId) { id1 = fileId;},
  })

  const evaporate = new Evaporate(baseConfig)
  let promise1 = evaporate.add(config1)
  let promise2 = evaporate.add(config2)

  return Promise.all([promise1, promise2])
      .then (function () {
        expect(id0).to.equal(baseConfig.bucket + '/' + config1.name);
        expect(id1).to.equal(baseConfig.bucket + '/' + config2.name);
      })
})

test('should call a callback on successful add()', () => {
  let id
  const config = Object.assign({}, baseAddConfig, {
    started: sinon.spy(function (fileId) {
      id = fileId;
    })
  })

  return new Evaporate(baseConfig)
      .add(config)
      .then(function () {
        expect(config.started).to.have.been.called
        expect(config.started).to.have.been.calledWithExactly(baseConfig.bucket + '/' + baseAddConfig.name)
      })
})

// cancel

test('should fail to cancel() when no id is present', () => {
  const evaporate = new Evaporate(baseConfig)
  const result = evaporate.cancel()

  expect(result).to.not.be.ok
})

test('should fail to cancel() when non-existing id is present', () => {
  const evaporate = new Evaporate(baseConfig)
  const result = evaporate.cancel('non-existent-file')

  expect(result).to.not.be.ok
})

test('should cancel() an upload with correct object name', async () => {
  const config = Object.assign({}, baseAddConfig, {
    name: randomAwsKey(),
    started: function (fileId) { id = fileId; }
  })

  let id

  const evaporate = new Evaporate(baseConfig)
  await evaporate.add(config)
      .catch(function (reason) {
        console.log(reason)
      })

  const result = evaporate.cancel(id)

  expect(result).to.be.ok
})

test('should cancel() two uploads with correct id', () => {

  let config1 = Object.assign({}, baseAddConfig, {
    started: function (fileId) { id0 = fileId;}
  })
  let config2 = Object.assign({}, config1, {
    name: randomAwsKey(),
    started: function (fileId) { id1 = fileId;},
  })
  let id0, id1

  const evaporate = new Evaporate(baseConfig)
  let promise0 = evaporate.add(config1)
  let promise1 = evaporate.add(config2)

  return Promise.all([promise0, promise1])
      .then (function () {
        const result0 = evaporate.cancel(id0)
        const result1 = evaporate.cancel(id1)

        expect(result0).to.be.ok
        expect(result1).to.be.ok
      })
})

test.serial('should call a callback on cancel()', async () => {
  // TODO: cancel() should return a promise
  var deferred = defer();

  const evapConfig = Object.assign({}, baseConfig, {
    evaporateChanged: sinon.spy()
  })
  const evaporate = new Evaporate(evapConfig)
  const config = Object.assign({}, baseAddConfig, {
    name: randomAwsKey(),
    cancelled: sinon.spy(function () { deferred.resolve() }),
    started: function (fileId) { id = fileId; },
    complete: function () { deferred.resolve() }
  })

  let id

  var objName = config.name;
  evaporate.add(config)

  await deferred.promise

  deferred = defer();

  const result = evaporate.cancel(id)

  await deferred.promise

  expect(result).to.be.ok
  expect(config.cancelled).to.have.been.called

  expect(evapConfig.evaporateChanged).to.have.been.called
  expect(evapConfig.evaporateChanged.callCount).to.equal(3)

  expect(evapConfig.evaporateChanged.firstCall.args[1]).to.eql(1)
  expect(evapConfig.evaporateChanged.secondCall.args[1]).to.eql(0)
  expect(evapConfig.evaporateChanged.thirdCall.args[1]).to.eql(0)
})

test('should call a callback on pause()', () => {
  const evaporate = new Evaporate(baseConfig)
  const config = Object.assign({}, baseAddConfig, {
    pausing: sinon.spy(),
    paused: sinon.spy(),
    started: function (fileId) { id = fileId; }
  })
  let id

  evaporate.add(config)
  evaporate.pause(id)

  expect(config.pausing).to.have.been.called
})

test('should call a callback on pause() with force option', () => {
  // TODO: Pause should return a Promise
  const evaporate = new Evaporate(baseConfig)
  const config = Object.assign({}, baseAddConfig, {
    pausing: sinon.spy(),
    paused: sinon.spy(),
    started: function (fileId) { id = fileId; }
  })
  let id
  evaporate.add(config)
  evaporate.pause(id, { force: true })

  expect(config.paused).to.have.been.called
})

test('should call a callback on resume()', () => {
  const evaporate = new Evaporate(baseConfig)
  const config = Object.assign({}, baseAddConfig, {
    pausing: sinon.spy(),
    paused: sinon.spy(),
    resumed: sinon.spy(),
    started: function (fileId) { id = fileId; }
  })
  let id
  evaporate.add(config)
  evaporate.pause(id, { force: true })
  evaporate.resume(id)

  expect(config.paused).to.have.been.called
  expect(config.resumed).to.have.been.called
})

test('should call signResponseHandler() with the correct number of parameters', async () => {
  const evapConfig = Object.assign({}, baseConfig, {
    signerUrl: undefined,
    signResponseHandler: sinon.spy(function () {
      return 'abcd'})
  })

  return new Evaporate(evapConfig)
      .add(baseAddConfig)
      .then(function () {
        expect(evapConfig.signResponseHandler.firstCall.args.length).to.eql(3)
      })
})
