import chai, { expect } from 'chai'
import chaiSinon from 'sinon-chai'
import sinon from 'sinon'
import test from 'ava'

chai.use(chaiSinon)

// consts

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

test.before(() => {
  sinon.xhr.supportsCORS = true
  global.XMLHttpRequest = sinon.useFakeXMLHttpRequest()
  server = serverCommonCase()
})

test.beforeEach((t) =>{
  localStorage.removeItem('awsUploads')
  let testId = 'evaporate/' + t.title

  t.context.testId = testId
  t.context.requests = []

  t.context.retry = function (type) {}

  t.context.baseAddConfig = {
    name: AWS_UPLOAD_KEY,
    file: new File({
      path: '/tmp/file',
      size: 50
    }),
    xAmzHeadersAtInitiate: {testId: testId},
    xAmzHeadersCommon: { testId: testId }
  }

  testContext[testId] = t.context

})

test('should work', (t) => {
  expect(true).to.be.ok
})

// constructor

test('should return supported instance', (t) => {
  expect(newEvaporate(t, baseConfig).supported).to.be.ok
})

test('should return supported instance with public functions', (t) => {
  const evaporate = newEvaporate(t, baseConfig)
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

// add

test('should fail to add() when no file is present', (t) => {
  const evaporate = newEvaporate(t, baseConfig)
  const result = evaporate.add()

  expect(result).to.equal('Missing file')
})

test('should fail to add() when empty config is present', (t) => {
  const evaporate = newEvaporate(t, baseConfig)
  const emptyConfig = {}
  const result = evaporate.add(emptyConfig)

  expect(result).to.equal('Missing attribute: name  ')
})

test('should add() new upload with correct config', (t) => {
  return testBase(t)
      .then(function (fileKey) {
        let id = fileKey;
        expect(id).to.equal(baseConfig.bucket + '/' + baseAddConfig.name)
      })
})

test('should return fileKeys correctly for common cases started, resolve', (t) => {
  let config = Object.assign({}, baseAddConfig, {
    started: function (fileKey) { start_id = fileKey; }
  })

  let start_id
  return testBase(t, config)
      .then(function (fileKey) {
        let expected = baseConfig.bucket + '/' + config.name
        expect(start_id + fileKey).to.equal(expected + expected)
      })
})

test('should return the object key in the complete callback', (t) => {
  let complete_id

  let config = Object.assign({}, baseAddConfig, {
    complete: function (xhr, name) { complete_id = name;}
  })

  return testBase(t, config)
      .then(function () {
        expect(complete_id).to.equal(config.name)
      })

})

test('should add() two new uploads with correct config', (t) => {
  let id0, id1

  let config1 = Object.assign({}, baseAddConfig, {
    started: function (fileId) { id0 = fileId; }
  })
  let config2 = Object.assign({}, config1, {
    name: randomAwsKey(),
    started: function (fileId) { id1 = fileId;},
  })

  let promise1 = testBase(t, config1)
  let promise2 = testBase(t, config2)

  return Promise.all([promise1, promise2])
      .then (function () {
        expect(id0).to.equal(baseConfig.bucket + '/' + config1.name);
        expect(id1).to.equal(baseConfig.bucket + '/' + config2.name);
      })
})

test('should call a callback on successful add()', (t) => {
  return testBase(t)
      .then(function () {
        expect(t.context.config.started).to.have.been.called
        expect(t.context.config.started).to.have.been.calledWithExactly(baseConfig.bucket + '/' + baseAddConfig.name)
      })
})

// cancel

test('should fail to cancel() when no id is present', (t) => {
  const evaporate = newEvaporate(t, baseConfig)
  const result = evaporate.cancel()

  expect(result).to.not.be.ok
})

test('should fail to cancel() when non-existing id is present', (t) => {
  const evaporate = newEvaporate(t, baseConfig)
  const result = evaporate.cancel('non-existent-file')

  expect(result).to.not.be.ok
})

test('should cancel() an upload with correct object name', (t) => {
  const config = Object.assign({}, baseAddConfig, {
    name: randomAwsKey(),
    started: function (fileId) { id = fileId; }
  })

  let id

  return testBase(t, config)
      .then(function () {
        const result = t.context.evaporate.cancel(id)
        expect(result).to.be.ok
      })
})

test('should cancel() two uploads with correct id', (t) => {

  let config1 = Object.assign({}, baseAddConfig, {
    started: function (fileId) { id0 = fileId;}
  })
  let config2 = Object.assign({}, config1, {
    name: randomAwsKey(),
    started: function (fileId) { id1 = fileId;},
  })
  let id0, id1

  let promise0 = testBase(t, config1)
  let promise1 = testBase(t, config2)

  return Promise.all([promise0, promise1])
      .then (function () {
        const result0 = t.context.evaporate.cancel(id0)
        const result1 = t.context.evaporate.cancel(id1)

        expect(typeof result0).to.be.ok
        expect(result1).to.be.ok
      })
})

test('should call a callback on cancel()', (t) => {
  const evapConfig = Object.assign({}, baseConfig, {
    evaporateChanged: sinon.spy()
  })
  const config = Object.assign({}, baseAddConfig, {
    name: randomAwsKey(),
    cancelled: sinon.spy(),
    started: function (fileId) { id = fileId; }
  })

  let id

  return testBase(t, config, evapConfig)
      .then(function () {
        t.context.evaporate.cancel(id)
            .then(function () {
              expect(config.cancelled).to.have.been.called

              expect(evapConfig.evaporateChanged).to.have.been.called
              expect(evapConfig.evaporateChanged.callCount).to.equal(3)

              expect(evapConfig.evaporateChanged.firstCall.args[1]).to.eql(1)
              expect(evapConfig.evaporateChanged.secondCall.args[1]).to.eql(0)
              expect(evapConfig.evaporateChanged.thirdCall.args[1]).to.eql(0)
            })
      })
})

