import chai, { expect } from 'chai'
import chaiSinon from 'sinon-chai'
import sinon from 'sinon'
import test from 'ava'
import Evaporate from '../evaporate'

chai.use(chaiSinon)

// consts

const baseConfig = {
  signerUrl: 'http://what.ever/sign',
  aws_key: 'testkey',
  bucket: AWS_BUCKET,
  logging: false,
  maxRetryBackoffSecs: 0.1,
  awsSignatureVersion: '2',
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

function testCommon(t, addConfig, initConfig) {
  let evapConfig = Object.assign({}, {awsSignatureVersion: '2'}, initConfig)
  return testBase(t, addConfig, evapConfig)
}

function testCancelCallbacks(t) {
  const evapConfig = Object.assign({}, baseConfig, {
    evaporateChanged: sinon.spy()
  })
  const config = Object.assign({}, baseAddConfig, {
    name: randomAwsKey(),
    cancelled: sinon.spy(),
    started: function (fileId) { id = fileId; }
  })

  let id

  return testCommon(t, config, evapConfig)
      .then(function () {
        return t.context.evaporate.cancel(id)
      })
}


test.before(() => {
  sinon.xhr.supportsCORS = true
  global.XMLHttpRequest = sinon.useFakeXMLHttpRequest()
  server = serverCommonCase()
})

test.beforeEach((t) =>{
  beforeEachSetup(t, new File({
    path: '/tmp/file',
    size: 50,
    name: randomAwsKey()
  }))
})

test('should work', (t) => {
  expect(true).to.be.ok
})

// constructor

test('#create should return supported instance', (t) => {
  return Evaporate.create(baseConfig)
      .then(function (evaporate) {
        expect(evaporate).to.be.instanceof(Evaporate)
      },
      function (reason) {
        t.fail(reason)
      })
})
test('#create evaporate should support #add', (t) => {
  return Evaporate.create(baseConfig)
      .then(function (evaporate) {
            expect(evaporate.add).to.be.instanceof(Function)
          },
          function (reason) {
            t.fail(reason)
          })

})
test('#create evaporate should support #cancel', (t) => {
  return Evaporate.create(baseConfig)
      .then(function (evaporate) {
            expect(evaporate.cancel).to.be.instanceof(Function)
          },
          function (reason) {
            t.fail(reason)
          })

})
test('#create evaporate should support #pause', (t) => {
  return Evaporate.create(baseConfig)
      .then(function (evaporate) {
            expect(evaporate.pause).to.be.instanceof(Function)
          },
          function (reason) {
            t.fail(reason)
          })

})
test('#create evaporate should support #resume', (t) => {
  return Evaporate.create(baseConfig)
      .then(function (evaporate) {
            expect(evaporate.resume).to.be.instanceof(Function)
          },
          function (reason) {
            t.fail(reason)
          })

})
test('#create evaporate should support #forceRetry', (t) => {
  return Evaporate.create(baseConfig)
      .then(function (evaporate) {
            expect(evaporate.forceRetry).to.be.instanceof(Function)
          },
          function (reason) {
            t.fail(reason)
          })

})

// local time offset
test('#create evaporate should use default local time offset without a timeUrl', (t) => {
  return Evaporate.create(baseConfig)
      .then(function (evaporate) {
            expect(evaporate.localTimeOffset).to.equal(0)
          },
          function (reason) {
            t.fail(reason)
          })

})
test('#create evaporate should respect localTimeOffset', (t) => {
  var offset = 30,
      config = Object.assign({}, baseConfig, { localTimeOffset: offset })
  return Evaporate.create(config)
      .then(function (evaporate) {
            expect(evaporate.localTimeOffset).to.equal(30)
          },
          function (reason) {
            t.fail(reason)
          })

})
test('#create evaporate should respect returned server time from timeUrl when local is behind server', (t) => {
  var config = Object.assign({}, baseConfig, { timeUrl: 'http://example.com/time?testId=' + t.context.testId })
  t.context.timeUrlDate = new Date(new Date().setTime(new Date().getTime() + (60 * 60 * 1000)))
  return Evaporate.create(config)
      .then(function (evaporate) {
            expect(evaporate.localTimeOffset).to.be.closeTo(+3600000, 100)
          },
          function (reason) {
            t.fail(reason)
          })

})
test('#create evaporate should respect returned server time from timeUrl when server is behind local', (t) => {
  var config = Object.assign({}, baseConfig, { timeUrl: 'http://example.com/time?testId=' + t.context.testId })
  t.context.timeUrlDate = new Date(new Date().setTime(new Date().getTime() - (60 * 60 * 1000)))
  return Evaporate.create(config)
      .then(function (evaporate) {
            expect(evaporate.localTimeOffset).to.be.closeTo(-3600000, 100)
          },
          function (reason) {
            t.fail(reason)
          })

})
test('#create evaporate calls timeUrl only once', (t) => {
  var config = Object.assign({}, baseConfig, { timeUrl: 'http://example.com/time?testId=' + t.context.testId })
  return Evaporate.create(config)
      .then(function () {
            expect(t.context.timeUrlCalled).to.equal(1)
          },
          function (reason) {
            t.fail(reason)
          })

})
test('new Evaporate() should instantiate and return default offset before timeUrl', (t) => {
  var config = Object.assign({}, baseConfig, { timeUrl: 'http://example.com/time' })
  expect(new Evaporate(config).localTimeOffset).to.equal(0)
})
test('new Evaporate() should instantiate and not call timeUrl', (t) => {
  var config = Object.assign({}, baseConfig, { timeUrl: 'http://example.com/time' })
  var evaporate =  newEvaporate(t, config);
  return evaporateAdd(t, evaporate, config)
      .then(function () {
        expect(typeof t.context.timeUrlCalled).to.equal('undefined')
      })
})
test('new Evaporate() calls timeUrl only once', (t) => {
  var config = Object.assign({}, baseConfig, { timeUrl: 'http://example.com/time?testId=' + t.context.testId })
  expect(new Evaporate(config).localTimeOffset).to.equal(0)
})

// Unsupported
test('should require configuration options on instantiation', (t) => {
  return Evaporate.create()
      .then(function (evaporate) {
          t.fail('Evaporate instantiated but should not have.')
          },
          function (reason) {
            t.pass(reason)
          })

})
test('should signerUrl is required unless signResponseHandler is present', (t) => {
  return Evaporate.create({signerUrl: null, signResponseHandler: null})
      .then(function (evaporate) {
            t.fail('Evaporate instantiated but should not have.')
          },
          function (reason) {
            t.pass(reason)
          })

})

test('should require an AWS bucket with a signerUrl', (t) => {
  return Evaporate.create({signerUrl: 'https://sign.com/sign'})
      .then(function (evaporate) {
            t.fail('Evaporate instantiated but should not have.')
          },
          function (reason) {
            t.pass(reason)
          })

})
test('should require an AWS bucket without a signerUrl but with a signResponseHandler', (t) => {
  return Evaporate.create({signResponseHandler: function () {}})
      .then(function (evaporate) {
            t.fail('Evaporate instantiated but should not have.')
          },
          function (reason) {
            t.pass(reason)
          })

})
test('should require a cryptoMd5Method if computeContentMd5 is enabled', (t) => {
  return Evaporate.create({bucket: 'asdafsa', signerUrl: 'https://sign.com/sign', computeContentMd5: true})
      .then(function (evaporate) {
            t.fail('Evaporate instantiated but should not have.')
          },
          function (reason) {
            t.pass(reason)
          })

})
test('should require a cryptoHexEncodedHash256 method if computeContentMd5 is enabled with V4 signatures', (t) => {
  return Evaporate.create({
    bucket: 'asdafsa',
    signerUrl: 'https://sign.com/sign',
    computeContentMd5: true,
    awsSignatureVersion: '4',
    cryptoMd5Method: function () {}
  })
      .then(function (evaporate) {
            t.fail('Evaporate instantiated but should not have.')
          },
          function (reason) {
            t.pass(reason)
          })

})
test('should require computeContentMd5 if V4 signatures enabled', (t) => {
  return Evaporate.create({bucket: 'asdafsa', signerUrl: 'https://sign.com/sign', awsSignatureVersion: '4'})
      .then(function (evaporate) {
            t.fail('Evaporate instantiated but should not have.')
          },
          function (reason) {
            t.pass(reason)
          })
})

test.todo('should require browser File support')
test.todo('should require browser Blob support')
test.todo('should require browser Blob slice support')
test.todo('should require browser FileReader#readAsArrayBuffer support if computeContentMd5 enabled')

// add

test('should fail to add() when no file is present', (t) => {
  return Evaporate.create(baseConfig)
      .then(function (evaporate) {
        evaporate.add({ name: 'test' })
            .then(function () {
                  t.fail('Evaporate added a new file but should not have.')
                },
                function (reason) {
                  expect(reason).to.match(/missing file/i)
                })
      })
});
test('should fail to add() when empty config is present', (t) => {
  return Evaporate.create(baseConfig)
      .then(function (evaporate) {
        evaporate.add({})
            .then(function () {
                  t.fail('Evaporate added a new file but should not have.')
                },
                function (reason) {
                  t.pass(reason)
                })
      })
});
test('should fail to add() when no config is present', (t) => {
  return Evaporate.create(baseConfig)
      .then(function (evaporate) {
        evaporate.add()
            .then(function () {
                  t.fail('Evaporate added a new file but should not have.')
                },
                function (reason) {
                  t.pass(reason)
                })
      })
});
test('should require a name if file is present', (t) => {
  return Evaporate.create(baseConfig)
      .then(function (evaporate) {
        evaporate.add({
          file: new File({
            path: '/tmp/file',
            size: 50000
          })
        })
            .then(function () {
                  t.fail('Evaporate added a new file but should not have.')
                },
                function (reason) {
                  t.pass(reason)
                })
      })
});
test('should respect maxFileSize', (t) => {
  return Evaporate.create(Object.assign({}, baseConfig, {maxFileSize: 10}))
      .then(function (evaporate) {
        evaporate.add({
          file: new File({
            path: '/tmp/file',
            size: 50000
          })
        })
            .then(function () {
                  t.fail('Evaporate added a new file but should not have.')
                },
                function (reason) {
                  t.pass(reason)
                })
      })
});

test('should add() new upload with correct config', (t) => {
  return testCommon(t)
      .then(function (fileKey) {
        let id = fileKey;
        expect(id).to.equal(t.context.requestedAwsObjectKey)
      })
})
test('should add() new upload with correct completed XML', (t) => {
  return testCommon(t)
      .then(function () {
        expect(testRequests[t.context.testId][5].requestBody).to.equal('<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag></ETag></Part></CompleteMultipartUpload>')
      })
})

test('should return fileKeys correctly for common cases started', (t) => {
  let config = Object.assign({}, baseAddConfig, {
    started: function (fileKey) { start_id = fileKey; }
  })

  let start_id
  return testCommon(t, config)
      .then(function () {
        let expected = baseConfig.bucket + '/' + config.name
        expect(start_id).to.equal(expected)
      })
})

test('should return fileKeys correctly for common cases resolve', (t) => {
  return testCommon(t)
      .then(function (fileKey) {
        let expected = t.context.config.name
        expect(fileKey).to.equal(expected)
      })
})

test('should return the object key in the complete callback', (t) => {
  let complete_id

  let config = Object.assign({}, baseAddConfig, {
    complete: function (xhr, name) { complete_id = name;}
  })

  return testCommon(t, config)
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

  let promise1 = testCommon(t, config1)
  let promise2 = testCommon(t, config2)

  return Promise.all([promise1, promise2])
      .then (function () {
        expect(id0).to.equal(baseConfig.bucket + '/' + config1.name);
        expect(id1).to.equal(baseConfig.bucket + '/' + config2.name);
      })
})

test('should call a callback on successful add()', (t) => {
  return testCommon(t)
      .then(function () {
        expect(t.context.config.started.withArgs(baseConfig.bucket + '/' + t.context.requestedAwsObjectKey).calledOnce).to.be.true
      })
})

// cancel

test('should fail with a message when canceling all if no files are processing', (t) => {
  return Evaporate.create(baseConfig)
      .then(function (evaporate) {
        return evaporate.cancel()
            .then(function () {
              t.fail('Cancel did not fail.')
            })
            .catch(function (reason) {
              expect(reason).to.match(/no files to cancel/i)
            })
      })
})
test('should cancel() all uploads when cancel receives no parameters', (t) => {
  const config = Object.assign({}, baseAddConfig, {
    name: randomAwsKey(),
    started: function (fileId) { id = fileId; }
  })

  let id

  return testCommon(t, config)
      .then(function () {
        const result = t.context.evaporate.cancel()
        expect(result).to.be.ok
      })
      .catch(function (reason) {
        expect(reason).to.match(/no files to cancel/i)
      })
})


test('should fail to cancel() when non-existing id is present', (t) => {
  return Evaporate.create(baseConfig)
      .then(function (evaporate) {
        evaporate.cancel('non-existent-file')
            .then(function () {
              t.fail('Cancel did not fail.')
            })
            .catch(function (reason) {
              expect(reason).to.match(/does not exist/i)
            })
      })

})

test('should cancel() an upload with correct object name', (t) => {
  const config = Object.assign({}, baseAddConfig, {
    name: randomAwsKey(),
    started: function (fileId) { id = fileId; }
  })

  let id

  return testCommon(t, config)
      .then(function () {
        const result = t.context.evaporate.cancel(id)
        expect(result).to.be.ok
      })
})

test('should cancel() two uploads with correct id, first result OK', (t) => {

  let config1 = Object.assign({}, baseAddConfig, {
    started: function (fileId) { id0 = fileId;}
  })
  let config2 = Object.assign({}, config1, {
    name: randomAwsKey(),
    started: function (fileId) { id1 = fileId;},
  })
  let id0, id1

  let promise0 = testCommon(t, config1)
  let promise1 = testCommon(t, config2)

  return Promise.all([promise0, promise1])
      .catch(function (reason) {
        t.fail('Promises failed.')
      })
})

test('should call a callbacks on cancel(): canceled', (t) => {
  return testCancelCallbacks(t)
    .then(function () {
      expect(t.context.config.cancelled).to.have.been.called
    })
})
test('should call a callbacks on cancel(): evaporateChanged', (t) => {
  return testCancelCallbacks(t)
      .then(function () {
        expect(t.context.evapConfig.evaporateChanged).to.have.been.called
      })
})
test('should call a callbacks on cancel(): evaporateChanged call count', (t) => {
  return testCancelCallbacks(t)
      .then(function () {
        expect(t.context.evapConfig.evaporateChanged.callCount).to.equal(2)
      })
})
test('should call a callbacks on cancel(): evaporateChanged first call args', (t) => {
  return testCancelCallbacks(t)
      .then(function () {
        expect(t.context.evapConfig.evaporateChanged.firstCall.args[1]).to.eql(1)
      })
})
test('should call a callbacks on cancel(): evaporateChanged second call args', (t) => {
  return testCancelCallbacks(t)
      .then(function () {
        expect(t.context.evapConfig.evaporateChanged.secondCall.args[1]).to.eql(0)
      })
})

// configuration overrides
test('should add() new upload with correct config with custom bucket on add', (t) => {
  const customBucket = 'fileCustomBucket'
  let config = {
    configOverrides: { bucket: customBucket }
  }

  return testCommon(t, config)
      .then(function () {
        expect(testRequests[t.context.testId][1].url).to.match(new RegExp(customBucket))
      })
})

