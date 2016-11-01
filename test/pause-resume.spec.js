import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

// constants

let server

function testPauseResume(t) {

  const config = {
    name: t.context.requestedAwsObjectKey,
    file: new File({
      path: '/tmp/file',
      size: 12000000,
      name: randomAwsKey()
    }),
    started: sinon.spy(),
    pausing: sinon.spy(),
    paused: sinon.spy(),
    resumed: sinon.spy()
  }
  t.context.name = config.name

  return testBase(t, config, {})
}

test.before(() => {
  sinon.xhr.supportsCORS = true
  global.XMLHttpRequest = sinon.useFakeXMLHttpRequest()
  global.window = {
    localStorage: {},
    console: console
  };

  function partRequestHandler(xhr, context)  {
    if (xhr.url.indexOf('partNumber=1') > -1) {
      context.pause()
          .then(function () {
            context.resume()
          });
    }
    xhr.respond(200)
  }

  server = serverCommonCase(partRequestHandler)
})

test.beforeEach((t) => {
  beforeEachSetup(t)

  t.context.pause = function (force) {
    return t.context.evaporate.pause(t.context.uploadId, {force: force})
  }

  t.context.resume = function () {
    return t.context.evaporate.resume(t.context.uploadId)
  }
})

// Default Setup: V2 signatures: Pause & Resume
test('should Resume an upload and not call cryptoMd5', (t) => {
  return testPauseResume(t)
      .then(function () {
        expect(t.context.cryptoMd5.callCount).to.equal(0)
      })
})
test('should Resume an upload and callback started', (t) => {
  return testPauseResume(t)
      .then(function () {
        expect(t.context.config.started.callCount).to.equal(2)
      })
})
test('should Resume an upload and callback pausing', (t) => {
  return testPauseResume(t)
      .then(function () {
        expect(t.context.config.pausing.callCount).to.equal(1)
      })
})
test('should Resume an upload and callback paused', (t) => {
  return testPauseResume(t)
      .then(function () {
        expect(t.context.config.paused.callCount).to.equal(1)
      })
})
test('should Resume an upload and callback resumed', (t) => {
  return testPauseResume(t)
      .then(function () {
        expect(t.context.config.resumed.callCount).to.equal(1)
      })
})
test('should Resume an upload with S3 requests in the correct order', (t) => {
  return testPauseResume(t)
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test('should Resume an upload and return the correct file upload ID', (t) => {
  return testPauseResume(t)
      .then(function () {
        expect(t.context.completedAwsKey).to.equal(t.context.requestedAwsObjectKey)
      })
})

