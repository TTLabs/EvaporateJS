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
      'GET:to_sign': 'sign',
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
      size: 6000000,
      name: randomAwsKey()
    })
  }

  t.context.cryptoMd5 = sinon.spy(function (data) { return 'md5Checksum'; })

  headStatus = 200
  server = sinon.fakeServer.create({
    respondImmediately: true
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

    await t.context.testCommon(addConfig, evapConfig)

    partNumberMarker = 0

    await t.context.testCommon(addConfig, evapConfig)
  }

  t.context.testS3Reuse = async function (addConfig2, evapConfig2) {
    let evapConfig = Object.assign({}, baseConfig, {
      allowS3ExistenceOptimization: true,
      s3FileCacheHoursAgo: 24,
      computeContentMd5: true
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

  t.context.cancel = function () {
    t.context.evaporate.cancel(t.context.uploadId)
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

// Retry get authorization / Initiate Upload
test.serial('should retry get signature for common case: Initiate, Put, Complete (authorization)', async (t) => {
  let maxRetries = 1, attempts = 0, status
  server.respondWith('GET', /\/sign.*$/, (xhr) => {
      attempts += 1
      if (attempts > maxRetries) {
        status = 200
        attempts = 0
      } else {
        status = 403
      }

    const payload = Array(29).join()
      xhr.respond(status, CONTENT_TYPE_TEXT, payload)
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

  let requestOrder = function () {
    var request_order = []
    server.requests.forEach(function (r) {
      var x = r.url.split('?'),
          y = x[1] ? x[1].split('&') : '',
          z = y[0] ? y[0].split('=')[0] : y
      if (z === 'partNumber') {
        z += '='
        z += y[0].split('=')[1]
      }

      var v = z ? r.method + ':' + z : r.method
      request_order.push(requestMap[v] || v)
    })

    return request_order.join(',')
  }

  await t.context.testCommon({})

  expect(t.context.cryptoMd5.callCount).to.equal(0)
  expect(requestOrder()).to.equal('sign,sign,initiate,sign,sign,PUT:partNumber=1,sign,sign,complete')
})

// Retry Initiate Upload
test.serial('should retry Initiate', async (t) => {
  let maxRetries = 1, attempts = 0, status
  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
  })

  server.respondWith('POST', /^.*\?uploads.*$/, (xhr) => {
    attempts += 1
    if (attempts > maxRetries) {
      status = 200
      attempts = 0
    } else {
      status = 403
    }

    xhr.respond(status, CONTENT_TYPE_XML, initResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })

  server.respondWith('PUT', /^.*$/, (xhr) => {
    xhr.respond(200)
  })

  server.respondWith('POST', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(200, CONTENT_TYPE_XML, completeResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })


  await t.context.testCommon({})

  expect(t.context.cryptoMd5.callCount).to.equal(0)
  expect(t.context.request_order()).to.equal('initiate,initiate,PUT:partNumber=1,complete')
})

// Retry Complete Upload
test.serial('should retry Complete', async (t) => {
  let maxRetries = 1, attempts = 0, status
  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
  })

  server.respondWith('POST', /^.*\?uploads.*$/, (xhr) => {
    xhr.respond(200, CONTENT_TYPE_XML, initResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })

  server.respondWith('PUT', /^.*$/, (xhr) => {
    xhr.respond(200)
  })

  server.respondWith('POST', /.*\?uploadId.*$/, (xhr) => {
    attempts += 1
    if (attempts > maxRetries) {
      status = 200
      attempts = 0
    } else {
      status = 403
    }
    xhr.respond(status, CONTENT_TYPE_XML, completeResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })


  await t.context.testCommon({})

  expect(t.context.cryptoMd5.callCount).to.equal(0)
  expect(t.context.request_order()).to.equal('initiate,PUT:partNumber=1,complete,complete')
})

// Retry PUT Upload
test.serial('should retry Upload Part', async (t) => {
  let maxRetries = 1, attempts = 0, status
  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
  })

  server.respondWith('POST', /^.*\?uploads.*$/, (xhr) => {
    xhr.respond(200, CONTENT_TYPE_XML, initResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })

  server.respondWith('PUT', /^.*$/, (xhr) => {
    attempts += 1
    if (attempts > maxRetries) {
      status = 200
      attempts = 0
    } else {
      status = 403
    }
    var errResponse = `
    <?xml version="1.0" encoding="UTF-8"?>
      <Error>
        <Code>NoSuchKey</Code>
        <Message>The resource you requested does not exist</Message>
        <Resource>/mybucket/myfoto.jpg</Resource> 
        <RequestId>4442587FB7D0A2F9</RequestId>
      </Error>`

    xhr.respond(status, CONTENT_TYPE_XML, status === 200 ? '' : errResponse)
  })

  server.respondWith('POST', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(200, CONTENT_TYPE_XML, completeResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })


  await t.context.testCommon({})

  expect(t.context.cryptoMd5.callCount).to.equal(0)
  expect(t.context.request_order()).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=1,complete')
})

// Cancel
test.serial('should not retry Cancel but trigger Initiate if status is 404', async (t) => {

  server.respondWith('DELETE', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(404)
  })

  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
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

  server.respondWith('GET', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(404)
  })

  const config = {
    started: sinon.spy(function () { }),
    cancelled: sinon.spy(function () {
      t.context.resolve();
    }),
    error: sinon.spy(function (msg) {
      t.context.resolve();
    })
  }

  await t.context.testBase(config)

  t.context.deferred = defer();

  t.context.cancel()

  await t.context.deferred.promise

  expect(t.context.config.started.callCount).to.equal(1)
  expect(t.context.config.cancelled.callCount).to.equal(1)
  expect(t.context.request_order()).to.equal('initiate,PUT:partNumber=1,complete,cancel,check for parts')
})

test.serial('should retry Cancel twice if status is non-404 error', async (t) => {

  server.respondWith('DELETE', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(403)
  })

  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
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

  const config = {
    started: sinon.spy(function () { }),
    cancelled: sinon.spy(function () {
      t.context.resolve();
    }),
    error: sinon.spy(function (msg) {
      t.context.resolve();
    })
  }

  await t.context.testBase(config)

  t.context.deferred = defer();

  t.context.cancel()

  await t.context.deferred.promise

  expect(t.context.config.started.callCount).to.equal(1)
  expect(t.context.config.cancelled.callCount).to.equal(0)
  expect(t.context.request_order()).to.equal('initiate,PUT:partNumber=1,complete,cancel,cancel')
})

test.serial('should not retry check for aborted parts if status is 404', async (t) => {

  server.respondWith('GET', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(404)
  })

  server.respondWith('DELETE', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(202)
  })

  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
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

  const config = {
    started: sinon.spy(function () { }),
    cancelled: sinon.spy(function () {
      t.context.resolve();
    }),
    error: sinon.spy(function (msg) {
      t.context.resolve();
    })
  }

  await t.context.testBase(config)

  t.context.deferred = defer();

  t.context.cancel()

  await t.context.deferred.promise

  expect(t.context.config.started.callCount).to.equal(1)
  expect(t.context.config.cancelled.callCount).to.equal(1)
  expect(t.context.request_order()).to.equal('initiate,PUT:partNumber=1,complete,cancel,check for parts')
})

test.serial('should retry check for remaining aborted parts twice if status is non-404 error', async (t) => {

  server.respondWith('GET', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(403)
  })

  server.respondWith('DELETE', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(202)
  })

  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
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

  const config = {
    started: sinon.spy(function () { }),
    cancelled: sinon.spy(function () {
      t.context.resolve();
    }),
    error: sinon.spy(function (msg) {
      t.context.resolve();
    })
  }

  await t.context.testBase(config)

  t.context.deferred = defer();

  t.context.cancel()

  await t.context.deferred.promise

  expect(t.context.config.started.callCount).to.equal(1)
  expect(t.context.config.cancelled.callCount).to.equal(1)
  expect(t.context.request_order()).to.equal('initiate,PUT:partNumber=1,complete,cancel,check for parts,check for parts')
})

test.serial('should not retry check for remaining uploaded parts if status is 404', async (t) => {
  server.respondWith('GET', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(404)
  })

  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
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

  await t.context.testCachedParts({}, 1, 0)

  expect(t.context.request_order()).to.equal(
      'initiate,PUT:partNumber=1,complete,' +
      'check for parts,' +
      'initiate,PUT:partNumber=1,complete')
})

// HeadObject
test.serial('should not retry DELETE when trying to reuse S3 object and status is 404', async (t) => {
  server.respondWith('HEAD', /./, (xhr) => {
    xhr.respond(404)
  })

  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
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

  await t.context.testS3Reuse({})

  expect(t.context.config.complete.callCount).to.equal(1)
  expect(t.context.request_order()).to.equal(
      'initiate,PUT:partNumber=1,complete,HEAD,' +
      'initiate,PUT:partNumber=1,complete')
  expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
})

test.serial('should retry DELETE twice when trying to reuse S3 object and status is non-404 error', async (t) => {
  let headEtag = '"b2969107bdcfc6aa30892ee0867ebe79-1"';
  server.respondWith('HEAD', /./, (xhr) => {
    xhr.respond(403, {eTag: headEtag}, '')
  })

  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
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

  await t.context.testS3Reuse({})

  expect(t.context.config.complete.callCount).to.equal(1)
  expect(t.context.request_order()).to.equal(
      'initiate,PUT:partNumber=1,complete,HEAD,HEAD,' +
      'initiate,PUT:partNumber=1,complete')
  expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
})

// Cached Parts
test.serial('should not retry check for parts if status is 404', async (t) => {
  server.respondWith('GET', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(404)
  })

  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
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

  await t.context.testCachedParts({}, 1, 0)

  expect(t.context.request_order()).to.equal(
      'initiate,PUT:partNumber=1,complete,' +
      'check for parts,' +
      'initiate,PUT:partNumber=1,complete')
})

test.serial('should retry check for parts twice if status is non-404 error', async (t) => {
  server.respondWith('GET', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(403)
  })

  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
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

  await t.context.testCachedParts({}, 1, 0)

  expect(t.context.request_order()).to.equal(
      'initiate,PUT:partNumber=1,complete,' +
      'check for parts,check for parts,' +
      'initiate,PUT:partNumber=1,complete')
})
