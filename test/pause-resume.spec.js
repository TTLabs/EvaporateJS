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

  return testBase(t, config, { awsSignatureVersion: '2' })
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
      if (context.pauseHandler) {
        context.pauseHandler();
      } else {
        context.pausePromise = context.pause()
            .then(function () {
              context.resumePromise = context.resume()
            })
      }
    }
    xhr.respond(200)
  }

  server = serverCommonCase(partRequestHandler)
})

test.beforeEach((t) => {
  beforeEachSetup(t)

  t.context.pause = function () {
    return t.context.evaporate.pause(t.context.pauseFileId || t.context.uploadId, {force: t.context.force})
  }

  t.context.resume = function () {
    return t.context.evaporate.resume(t.context.resumeFileId || t.context.uploadId)
  }
})

// Default Setup: V2 signatures: Pause & Resume
test('should Resume an upload and not call cryptoMd5', (t) => {
  return testPauseResume(t)
      .then(function () {
        expect(t.context.cryptoMd5.called).to.be.false
      })
})
test('should Resume an upload and callback started twice with the file key', (t) => {
  return testPauseResume(t)
      .then(function () {
        expect(t.context.config.started.withArgs(AWS_BUCKET + '/' + t.context.requestedAwsObjectKey).calledTwice).to.be.true
      })
})
test('should Resume an upload and callback pausing', (t) => {
  return testPauseResume(t)
      .then(function () {
        expect(t.context.config.pausing.calledOnce).to.be.true
      })
})
test('should Resume an upload and callback paused', (t) => {
  return testPauseResume(t)
      .then(function () {
        expect(t.context.config.paused.calledOnce).to.be.true
      })
})
test('should Resume an upload and callback resumed', (t) => {
  return testPauseResume(t)
      .then(function () {
        expect(t.context.config.resumed.calledOnce).to.be.true
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

test('should fail to pause() when file not added', (t) => {
  t.context.pauseFileId = 'nonexistent'
  return testPauseResume(t)
      .then(function () {
        return t.context.pausePromise
            .then(
                function () {
                  t.fail('Expected test to fail.')
                },
                function (reason) {
                  expect(reason).to.match(/has not been added/i)
                }
            )
      })
});
test('should fail to pause() when file already paused', (t) => {
  let pausePromise = new Promise(function (resolve, reject) {
    t.context.pauseHandler = function () {
      t.context.pause()
          .then(function () {
            t.context.pausePromise =  t.context.pause()
            t.context.pausePromise.then(resolve, reject)
          })
    }
  });

  return Promise.race([testPauseResume(t), pausePromise])
      .then(
          function () {
            t.fail('Expected test to fail.')
          },
          function (reason) {
            expect(reason).to.match(/already paused/i)
          }
      )
});

test('should fail to resume() when file not added', (t) => {
  t.context.resumeFileId = 'nonexistent'
  t.context.pauseHandler = function () {
    t.context.resumePromise = t.context.resume()
  }

  return testPauseResume(t)
      .then(function () {
        return t.context.resumePromise
            .then(
                function () {
                  t.fail('Expected test to fail.')
                },
                function (reason) {
                  expect(reason).to.match(/does not exist/i)
                }
            )
      })
});
test('should fail to resume() when file not paused', (t) => {
  t.context.pauseHandler = function () {
    t.context.resumePromise = t.context.resume()
  }

  return testPauseResume(t)
      .then(function () {
        return t.context.resumePromise
            .then(
                function () {
                  t.fail('Expected test to fail.')
                },
                function (reason) {
                  expect(reason).to.match(/not been paused/i)
                }
            )
      })
});
