import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

// constants

let server


function testCommon(t, addCfg, initConfig) {
  let addConfig = Object.assign({}, { file: new File({
    path: '/tmp/file',
    size: 50,
    name: 'tests'
  })}, addCfg)

  let evapConfig = Object.assign({}, {awsSignatureVersion: '2', enablePartSizeOptimization: true}, initConfig)
  return testBase(t, addConfig, evapConfig)
}
function testMd5V2(t) {
  return testCommon(t, {}, { awsSignatureVersion: '2', computeContentMd5: true })
}

function testMd5V4(t) {
  return testCommon(t, {}, {
    computeContentMd5: true,
    cryptoHexEncodedHash256: function (d) { return d; }
  })
}



test.before(() => {
  sinon.xhr.supportsCORS = true
  global.XMLHttpRequest = sinon.useFakeXMLHttpRequest()
  global.window = {
    localStorage: {},
    console: console
  };

  server = serverCommonCase()
})

test.beforeEach((t) => {
  beforeEachSetup(t)
})

// Callbacks
test('should call a callback on successful add()', (t) => {
  return testCommon(t)
      .then(function () {
        expect(t.context.config.started.withArgs('bucket/' + t.context.requestedAwsObjectKey).calledOnce).to.be.true
      })
})
test('should call a progress with stats callback on successful add()', (t) => {
  return testCommon(t, {progress: sinon.spy()})
      .then(function () {
        expect(t.context.config.progress.firstCall.args.length).to.equal(2)
        expect(typeof t.context.config.progress.firstCall.args[1]).to.equal('object')
      })
})
test('should return the object key in the complete callback', (t) => {
  let complete_id

  let config = Object.assign({}, {}, {
    name:  AWS_UPLOAD_KEY,
    complete: sinon.spy(function (xhr, name) { complete_id = name; })
  })

  return testCommon(t, config)
      .then(function () {
        expect(complete_id).to.equal(config.name)
        expect(t.context.config.complete.firstCall.args.length).to.equal(3)
        expect(t.context.config.complete.firstCall.args[0]).to.be.undefined
        expect(typeof t.context.config.complete.firstCall.args[1]).to.equal('string')
        expect(typeof t.context.config.complete.firstCall.args[2]).to.equal('object')
      })

})


// Default Setup: V2 signatures: Common Case
test('should not call cryptoMd5 upload a file with defaults and V2 signature', (t) => {
  return testCommon(t, {}, { awsSignatureVersion: '2' })
      .then(function () {
        expect(t.context.cryptoMd5.callCount).to.equal(0)
      })
})
test('should upload a file with S3 requests in the correct order', (t) => {
  return testCommon(t)
      .then(function () {
        expect(requestOrder(t)).to.equal('put object')
      })
})
test('should upload a file and return the correct file upload ID', (t) => {
  return testCommon(t)
      .then(function () {
        expect(t.context.completedAwsKey).to.equal(t.context.requestedAwsObjectKey)
      })
})
test('should upload a file and callback complete once', (t) => {
  return testCommon(t)
      .then(function () {
        expect(t.context.config.complete.calledOnce).to.be.true
      })
})
test('should upload a file and callback complete with second param the awsKey', (t) => {
  return testCommon(t)
      .then(function () {
        expect(t.context.config.complete.firstCall.args[1]).to.equal(t.context.requestedAwsObjectKey)
      })
})
test('should upload a file and not callback with a changed object name', (t) => {
  return testCommon(t, {nameChanged: sinon.spy()})
      .then(function () {
        expect(t.context.config.nameChanged.callCount).to.equal(0)
      })
})

// md5Digest tests
test('V2 should call cryptoMd5 when uploading a file with defaults', (t) => {
  return testMd5V2(t)
      .then(function () {
        expect(t.context.cryptoMd5.callCount).to.equal(1)
      })
})
test('V2 should upload a file with MD5Digests with S3 requests in the correct order', (t) => {
  return testMd5V2(t)
      .then(function () {
        expect(requestOrder(t)).to.equal('put object')
      })
})
test('V2 should upload a file and return the correct file upload ID', (t) => {
  return testMd5V2(t)
      .then(function () {
        expect(t.context.completedAwsKey).to.equal(t.context.requestedAwsObjectKey)
      })
})

test('V4 should call cryptoMd5 when uploading a file with defaults', (t) => {
  return testMd5V4(t)
      .then(function () {
        expect(t.context.cryptoMd5.callCount).to.equal(1)
      })
})
test('V4 should upload a file with MD5Digests with S3 requests in the correct order', (t) => {
  return testMd5V4(t)
      .then(function () {
        expect(requestOrder(t)).to.equal('put object')
      })
})
test('V4 should upload a file and return the correct file upload ID', (t) => {
  return testMd5V4(t)
      .then(function () {
        expect(t.context.completedAwsKey).to.equal(t.context.requestedAwsObjectKey)
      })
})

test('should retry Upload Part', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }

  return testCommon(t, { file: new File({
        path: '/tmp/file',
        size: 50,
        name: 'tests'
      })
    })
      .then(function () {
        expect(requestOrder(t)).to.equal('put object,put object')
      })
})
