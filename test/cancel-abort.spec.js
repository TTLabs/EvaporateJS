import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

// constants

let server

function defer() {
  var deferred = {}, promise;
  promise = new Promise(function(resolve, reject){
    deferred = {resolve: resolve, reject: reject};
  });
  return {
    resolve: deferred.resolve,
    reject: deferred.reject,
    promise: promise
  }
}
function testCancel(t, addConfig) {
  addConfig = addConfig || {}

  const config = Object.assign({}, {
    started: sinon.spy(),
    cancelled: sinon.spy()
  },
      addConfig)

  return testBase(t, config)
      .then(function () {
        t.context.cancelPromise = t.context.cancel()
        return t.context.cancelPromise
      })
}

test.before(() => {
  sinon.xhr.supportsCORS = true
  global.XMLHttpRequest = sinon.useFakeXMLHttpRequest()
  global.window = {
    localStorage: {},
    console: console
  };

  function partRequestHandler(xhr, context)  {
    if (context.pauseUpload) {
      if (xhr.url.indexOf('partNumber=1') > -1) {
          context.pause(context.forcePause)
              .then(context.pausedPromise.resolve)
      }
    }
    return true
  }

  server = serverCommonCase(partRequestHandler)
})

test.beforeEach((t) => {
  beforeEachSetup(t)

  t.context.cancel = function () {
    return t.context.evaporate.cancel(t.context.uploadId)
  }
  t.context.pause = function (force) {
    return t.context.evaporate.pause(t.context.uploadId, {force: force})
  }
})

// Default Setup: V2 signatures, Cancel
test.serial('should Cancel an upload calling started once', (t) => {
  return testCancel(t)
      .then(function () {
        expect(t.context.config.started.callCount).to.equal(1)
      })
})
test.serial('should Cancel an upload calling cancelled once', (t) => {
  return testCancel(t)
      .then(function () {
        expect(t.context.config.cancelled.callCount).to.equal(1)
      })
})
test.serial('should Cancel an upload in the correct request order', (t) => {
  return testCancel(t)
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete,cancel')
      })
})
test.serial('should Cancel an upload and resolve the cancel promise', (t) => {
  return testCancel(t)
      .then(function () {
        t.context.cancelPromise
            .catch(t.fail)
      })
})
test.serial('should Cancel an upload and reduce evaporating count to 0', (t) => {
  const config = {
    file: new File({
      path: '/tmp/file',
      size: 990000000, // we need lots of parts so that we exceed the maxConcurrentParts
      name: randomAwsKey()
    })
  }
  return testCancel(t, config)
      .then(function () {
        expect(t.context.evaporate.evaporatingCount).to.equal(0)
      })
})

test.serial('should Cancel an upload after it is paused', (t) => {
  const config = {
    file: new File({
          path: '/tmp/file',
          size: 990000000, // we need lots of parts so that we exceed the maxConcurrentParts
          name: randomAwsKey()
        }),
    cancelled: sinon.spy()
  }

  t.context.pauseUpload = true
  t.context.pausedPromise = defer()

  t.context.pausedPromise.promise
      .then(
          function () {
            t.context.cancel()
          })

  return testBase(t, config)
      .then(
          function () {
            t.fail('Expected upload to fail but it did not.')
          },
          function (reason) {
            expect(reason).to.match(/aborted/i)
          })
})
test.serial('should Cancel an upload after it is paused if the cancel fails', (t) => {
  t.context.deleteStatus = 403

  const config = {
    file: new File({
      path: '/tmp/file',
      size: 990000000, // we need lots of parts so that we exceed the maxConcurrentParts
      name: randomAwsKey()
    }),
    cancelled: sinon.spy()
  }

  t.context.pauseUpload = true
  t.context.pausedPromise = defer()

  t.context.pausedPromise.promise
      .then(
          function () {
            t.context.cancel()
          })

  return testBase(t, config)
      .then(
          function () {
            t.fail('Expected upload to fail but it did not.')
          },
          function (reason) {
            expect(reason).to.match(/Error aborting upload/i)
          })
})

test.todo('should Cancel an upload after it is force paused')
test.todo('should cancel an upload while parts are uploading')

// Cancel (xAmzHeadersCommon)
test.serial('should set xAmzHeadersCommon on Cancel', (t) => {
  const config = {
    xAmzHeadersCommon: {
      'x-custom-header': 'stopped'
    }
  }

  t.context.retry = function (type) {
    return ['cancel', 'get parts'].indexOf(type) > -1
  }

  return testCancel(t, config)
      .then(function () {
        t.context.cancel()
            .then(function () {
              expect(headersForMethod(t, 'DELETE')['x-custom-header']).to.equal('stopped')
            })
      })
})

// retry
test.serial('should not retry Cancel but trigger Initiate if status is 404 with started callback', (t) => {
  t.context.deleteStatus = 404
  return testCancel(t)
      .then(function () {
        expect(t.context.config.started.callCount).to.equal(1)
      })
})
test.serial('should not retry Cancel but trigger Initiate if status is 404 with cancelled callback', (t) => {
  t.context.deleteStatus = 404
  return testCancel(t)
      .then(function () {
        expect(t.context.config.cancelled.callCount).to.equal(1)
      })
})
test.serial('should not retry Cancel but trigger Initiate if status is 404 in the correct order', (t) => {
  t.context.deleteStatus = 404
  return testCancel(t)
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete,cancel')
      })
})

test.serial('should retry Cancel twice if status is non-404 error with started callback', (t) => {
  t.context.deleteStatus = 403
  return testCancel(t)
      .then(function () {
        expect(t.context.config.started.callCount).to.equal(1)
      })
})
test.serial('should retry Cancel twice if status is non-404 error with cancelled callback', (t) => {
  t.context.deleteStatus = 403
  return testCancel(t)
      .then(function () {
        expect(t.context.config.cancelled.callCount).to.equal(0)
      })
})
test.serial('should retry Cancel twice if status is non-404 error in the correct order', (t) => {
  t.context.deleteStatus = 403
  return testCancel(t)
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete,cancel,cancel')
      })
})
