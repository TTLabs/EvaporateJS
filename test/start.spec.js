import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

import Evaporate from '../evaporate'

import initResponse from './fixtures/init-response'
import completeResponse from './fixtures/complete-response'
import getPartsResponse from './fixtures/get-parts-truncated-response'


// constants

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
  abortCompletionThrottlingMs: 0,
  progressIntervalMS: 5
}

const baseAddConfig = {
  name: AWS_UPLOAD_KEY,
  file: new File({
    path: '/tmp/file',
    size: 50,
    name: 'tests'
  })
}

let server,
    requestMap = {
      'POST:uploads': 'initiate',
      'POST:uploadId': 'complete',
      'DELETE:uploadId': 'cancel',
      'GET:uploadId': 'check for parts'
    },
    headersForMethod,
    headStatus

function randomAwsKey() {
  return Math.random().toString().substr(2) + '_' + AWS_UPLOAD_KEY
}

test.before(() => {
  sinon.xhr.supportsCORS = true
  global.XMLHttpRequest = sinon.useFakeXMLHttpRequest()
  global.window = {
    localStorage: {},
    console: console
  };
})

test.beforeEach((t) => {
  t.context.requestedAwsObjectKey = randomAwsKey()

  t.context.baseAddConfig = {
    name: t.context.requestedAwsObjectKey,
    file: new File({
      path: '/tmp/file',
      size: 12000000,
      name: randomAwsKey()
    })
  }

  t.context.cryptoMd5 = sinon.spy(function (data) { return 'md5Checksum'; })

  headStatus = 200
  server = sinon.fakeServer.create({
    respondImmediately: true
  })

  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
  })

  server.respondWith('POST', /^.*\?uploads.*$/, (xhr) => {
    xhr.respond(200, CONTENT_TYPE_XML, initResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })

  server.respondWith('POST', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(200, CONTENT_TYPE_XML, completeResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })

  headersForMethod = function(method, urlRegex) {
    var r = urlRegex || /./
    for (var i = 0; i < server.requests.length; i++) {
      var xhr = server.requests[i]
      if (xhr.method === method && xhr.url.match(r)) {
        return xhr.requestHeaders
      }
    }
    return {}
  }

  t.context.testBase = async function (addConfig, evapConfig) {
    t.context.deferred = defer();

    t.context.evaporate = new Evaporate(Object.assign({}, baseConfig,
        {cryptoMd5Method: t.context.cryptoMd5}, evapConfig))

    if (typeof addConfig.started === "function") {
      addConfig.user_started = addConfig.started;
      delete addConfig.started;
    }

    if (typeof addConfig.complete === "function") {
      addConfig.user_complete = addConfig.complete;
      delete addConfig.complete;
    }

    t.context.config = Object.assign({}, t.context.baseAddConfig, addConfig, {
      started: sinon.spy(function (id) {
        t.context.uploadId = id;
        if (typeof addConfig.user_started === "function")  {
          addConfig.user_started(id);
        }
      }),
      complete: sinon.spy(function (xhr, awsKey) {
        t.context.completedAwsKey = awsKey;
        if (typeof addConfig.user_complete === "function")  {
          addConfig.user_complete(xhr, awsKey);
        }
        t.context.deferred.resolve();
      })
    })

    t.context.evaporate.add(t.context.config)
setTimeout(function () {
  t.context.resolve();
}, 2000)
    await t.context.deferred.promise

  }

  t.context.request_order = function () {
    var request_order = []
    server.requests.forEach(function (r) {
      // Ignore the signing requests
      if (!r.url.match(/\/sign.*$/)) {
        var x = r.url.split('?'),
            y = x[1] ? x[1].split('&') : '',
            z = y[0] ? y[0].split('=')[0] : y
        if (z === 'partNumber') {
          z += '='
          z += y[0].split('=')[1]
        }

        var v = z ? r.method + ':' + z : r.method
        request_order.push(requestMap[v] || v)
      }
    })

    return request_order.join(',')
  }

  t.context.testCommon = async function (addConfig, evapConfig) {
    if (!t.context.putResponseSet) {
      server.respondWith('PUT', /^.*$/, (xhr) => {
        xhr.respond(200)
      })
      t.context.putResponseSet = true
    }
    await t.context.testBase(addConfig, evapConfig)
  }

  t.context.testPauseResume = async function (evapConfig) {
    server.respondWith('PUT', /^.*$/, (xhr) => {
      if (xhr.url.indexOf('partNumber=1') > -1) {
        t.context.pause();
      }
      xhr.respond(200)
    })

    server.respondWith('GET', /.*\?uploadId.*$/, (xhr) => {
      xhr.respond(200, CONTENT_TYPE_XML, getPartsResponse(AWS_BUCKET, AWS_UPLOAD_KEY, 0, 0))
    })

    const config = {
      name: t.context.requestedAwsObjectKey,
      file: new File({
        path: '/tmp/file',
        size: 12000000,
        name: randomAwsKey()
      }),
      started: sinon.spy(function () { }),
      pausing: sinon.spy(function () { }),
      paused: sinon.spy(function () {
        t.context.resume();
      }),
      resumed: sinon.spy(function () {})
    }

    await t.context.testBase(config, evapConfig)
  }

  t.context.testCachedParts = async function (addConfig, maxGetParts, partNumberMarker, l) {
    const evapConfig = {
      s3FileCacheHoursAgo: 24
    }

    server.respondWith('GET', /.*\?uploadId.*$/, (xhr) => {
      xhr.respond(t.context.getPartsStatus, CONTENT_TYPE_XML, getPartsResponse(AWS_BUCKET, AWS_UPLOAD_KEY, maxGetParts, partNumberMarker++))

    })

    await t.context.testCommon(addConfig, evapConfig)

    partNumberMarker = 0

    await t.context.testCommon(addConfig, evapConfig)
  }

  t.context.testS3Reuse = async function (addConfig2, headEtag, evapConfig2) {
    let evapConfig = Object.assign({}, baseConfig, {
      allowS3ExistenceOptimization: true,
      s3FileCacheHoursAgo: 24,
      computeContentMd5: true
    })

    server.respondWith('HEAD', /./, (xhr) => {
      if (headStatus === 404) {
        xhr.respond(headStatus)
      } else {
        xhr.respond(headStatus, {eTag: headEtag || 'custom-eTag'}, '')
      }
    })

    // Upload the first time
    await t.context.testCommon({}, evapConfig)

    addConfig2.name = randomAwsKey()

    // Upload the second time to trigger head
    evapConfig = Object.assign({}, evapConfig, evapConfig2 || {})
    await t.context.testCommon(addConfig2, evapConfig)

    t.context.requestedAwsObjectKey = addConfig2.name
  }

  t.context.pause = function (force) {
    t.context.evaporate.pause(t.context.uploadId, force)
  }

  t.context.resume = function () {
    t.context.evaporate.resume(t.context.uploadId)
  }

  t.context.resolve = function () {
    t.context.deferred.resolve()
  }
})

test.afterEach(() => {
  server.restore()
})

// Basic Upload a File
test.serial('should upload a file', async (t) => {
  await t.context.testCommon({})

  expect(t.context.cryptoMd5.callCount).to.equal(0)
  expect(t.context.request_order()).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
})

// Default Setup: V2 signatures: Pause & Resume
test.serial('should Resume an upload', async (t) => {

  await t.context.testPauseResume({})

  expect(t.context.cryptoMd5.callCount).to.equal(0)

  expect(t.context.request_order()).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
  expect(t.context.completedAwsKey).to.equal(t.context.requestedAwsObjectKey)
})

test.serial('should check for parts when re-uploading a cached file', async (t) => {
  t.context.getPartsStatus = 200

  await t.context.testCachedParts({}, 1, 0)

  expect(t.context.cryptoMd5.callCount).to.equal(0)
  expect(t.context.request_order()).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete,check for parts,PUT:partNumber=2,complete')
})

test.serial('should only upload remaining parts for an interrupted upload', async (t) => {
  t.context.getPartsStatus = 200

  await t.context.testCachedParts({ file: new File({
      path: '/tmp/file',
      size: 29690176,
      name: randomAwsKey()
    })
    }, 3, 0)

  expect(t.context.cryptoMd5.callCount).to.equal(0)
  expect(t.context.request_order()).to.equal(
      'initiate,PUT:partNumber=1,PUT:partNumber=2,PUT:partNumber=3,PUT:partNumber=4,PUT:partNumber=5,complete,' +
      'check for parts,check for parts,check for parts,' +
      'PUT:partNumber=4,PUT:partNumber=5,complete')
})

test.serial('should re-use S3 object', async (t) => {
  await t.context.testS3Reuse({}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')

  expect(t.context.config.complete.callCount).to.equal(1)
  expect(t.context.request_order()).to.equal(
      'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,HEAD')
  expect(t.context.cryptoMd5.callCount).to.equal(3)
  expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
})

test.serial('should not re-use S3 object if the first part\'s md5 digest do not match', async(t) => {
  var cryptoMd5 = sinon.spy(function (data) { return 'md5Mismatch'; })

  await t.context.testS3Reuse({}, '"b2969107bdcfc6aa30892ee0867ebe79-1"', {cryptoMd5Method: cryptoMd5})

  expect(t.context.request_order()).to.equal(
      'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
  expect(cryptoMd5.callCount).to.equal(2)

})

test.serial('should not re-use S3 object because the Etag does not match', async (t) => {
  await t.context.testS3Reuse({}, '"b2969107bdcfc6aa30892eeunmatched-1"')

  expect(t.context.config.complete.callCount).to.equal(1)
  expect(t.context.request_order()).to.equal(
      'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,' +
      'HEAD,' +
      'initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
  expect(t.context.cryptoMd5.callCount).to.equal(4)
  expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
})

test.serial('should not re-use S3 object if headObject returns 404', async(t) => {
  headStatus = 404

  await t.context.testS3Reuse({}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')

  expect(t.context.request_order()).to.equal(
      'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,' +
      'HEAD,' +
      'initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
})
