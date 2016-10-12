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
  logging: false
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
    }

function randomAwsKey() {
  return Math.random().toString().substr(2) + '_' + AWS_UPLOAD_KEY
}
test.before(() => {
  sinon.xhr.supportsCORS = true
  global.XMLHttpRequest = sinon.useFakeXMLHttpRequest()
  global.setTimeout = (fc) => fc()
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
      size: 50,
      name: randomAwsKey()
    })
  }

  t.context.server = sinon.fakeServer.create({
    respondImmediately: true
  })

  t.context.server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
  })

  t.context.server.respondWith('POST', /^.*\?uploads.*$/, (xhr) => {
    xhr.respond(200, CONTENT_TYPE_XML, initResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })

  t.context.server.respondWith('POST', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(200, CONTENT_TYPE_XML, completeResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })

  t.context.server.respondWith('DELETE', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(204)
  })

  t.context.testBase = async function (addConfig, evapConfig) {
    t.context.deferred = defer();

    t.context.evaporate = new Evaporate(Object.assign({}, baseConfig, evapConfig))

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

    var request_order = []
    t.context.server.requests.forEach(function (r) {
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

    t.context.request_order = request_order.join(',')
  }

  t.context.testCommon = async function (addConfig, evapConfig) {
    if (!t.context.putResponseSet) {
      t.context.server.respondWith('PUT', /^.*$/, (xhr) => {
        xhr.respond(200)
      })
      t.context.putResponseSet = true
    }
    await t.context.testBase(addConfig, evapConfig)
  }

  t.context.testCachedParts = async function (addConfig, maxGetParts, partNumberMarker) {
    const evapConfig = {
      s3FileCacheHoursAgo: 24
    }

    t.context.server.respondWith('GET', /.*\?uploadId.*$/, (xhr) => {
      xhr.respond(t.context.getPartsStatus, CONTENT_TYPE_XML, getPartsResponse(AWS_BUCKET, AWS_UPLOAD_KEY, partNumberMarker++, maxGetParts))

    })

    await t.context.testCommon(addConfig, evapConfig)
    await t.context.testCommon(addConfig, evapConfig)
  }

  t.context.testPauseResume = async function (force) {
    t.context.server.respondWith('PUT', /^.*$/, (xhr) => {
      if (xhr.url.indexOf('partNumber=1') > -1) {
        t.context.pause();
      }
      xhr.respond(200)
    })

    t.context.server.respondWith('GET', /.*\?uploadId.*$/, (xhr) => {
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
      resumed: sinon.spy(function () {
        t.context.resolve();
      })
    }

    await t.context.testBase(config)
  }

  t.context.testS3Reuse = async function (addConfig2, headEtag) {
    const evapConfig = Object.assign({}, baseConfig, {
      allowS3ExistenceOptimization: true,
      s3FileCacheHoursAgo: 24,
      computeContentMd5: true,
      cryptoMd5Method: function (data) { return 'md5Checksum'; }
    })

    t.context.server.respondWith('HEAD', /./, (xhr) => {
      xhr.respond(200, {eTag: headEtag || 'custom-eTag'}, '')
    })

    // Upload the first time
    await t.context.testCommon({}, evapConfig)

    addConfig2.name = randomAwsKey()

    // Upload the second time to trigger head
    await t.context.testCommon(addConfig2, evapConfig)

    t.context.requestedAwsObjectKey = addConfig2.name
  }

  t.context.testCancel = async function (addConfig) {
    t.context.server.respondWith('PUT', /^.*$/, (xhr) => {
      xhr.respond(200)
      t.context.cancel();
    })

    const config = Object.assign({}, {
      started: sinon.spy(function () { }),
      cancelled: sinon.spy(function () {
          t.context.resolve();
        })
      }, addConfig)

    await t.context.testBase(config)
  }

  t.context.cancel = function () {
    t.context.evaporate.cancel(t.context.uploadId)
  }

  t.context.pause = function (force) {
    t.context.evaporate.pause(t.context.uploadId, force)
  }

  t.context.resume = function () {
    t.context.evaporate.resume()
  }

  t.context.resolve = function () {
    t.context.deferred.resolve()
  }
})

test.afterEach((t) => {
  t.context.server.restore()
})

// Default Setup: V2 signatures, No Cache
test.serial('should upload a file', async (t) => {
  await t.context.testCommon({})

  expect(t.context.completedAwsKey).to.equal(t.context.requestedAwsObjectKey)
  expect(t.context.request_order).to.equal('initiate,PUT:partNumber=1,complete')
})

// Default Setup: V2 signatures, with parts Cache
test.serial('should check for parts when re-uploading a cached file when getParts 404s', async (t) => {
  t.context.getPartsStatus = 404

  await t.context.testCachedParts({
    computeContentMd5: true,
    cryptoMd5Method: function (data) {
      return 'md5Checksum';
    }
  }, 0)

  expect(t.context.config.started.callCount).to.equal(1)
  expect(t.context.completedAwsKey).to.equal(t.context.requestedAwsObjectKey)
  expect(t.context.request_order).to.equal(
      'initiate,PUT:partNumber=1,complete,' +
      'check for parts,PUT:partNumber=1,complete')
  expect(t.context.server.requests[7].status).to.equal(404)
})
test.todo('should check for parts when re-uploading a cached file when getParts 404s without md5Checksums')

test.serial('should check for parts when re-uploading a cached file, when getParts returns none', async (t) => {
  t.context.getPartsStatus = 200

  await t.context.testCachedParts({
    computeContentMd5: true,
    cryptoMd5Method: function (data) {
      return 'md5Checksum';
    }
  }, 0, 0)

  expect(t.context.config.started.callCount).to.equal(1)
  expect(t.context.request_order).to.equal(
      'initiate,PUT:partNumber=1,complete,' +
      'check for parts,PUT:partNumber=1,complete')
  expect(t.context.completedAwsKey).to.equal(t.context.requestedAwsObjectKey)
  expect(t.context.server.requests[7].status).to.equal(200)
})
test.todo('should check for parts when re-uploading a cached file, when getParts returns none without md5Checksums')

test.serial('should check for parts when re-uploading a cached file, when getParts is not truncated', async (t) => {
  t.context.getPartsStatus = 200

  await t.context.testCachedParts({
    computeContentMd5: true,
    cryptoMd5Method: function (data) {
      return 'md5Checksum';
    }
  }, 1,1)

  expect(t.context.config.started.callCount).to.equal(1)
  expect(t.context.completedAwsKey).to.equal(t.context.requestedAwsObjectKey)
  expect(t.context.request_order).to.equal(
      'initiate,PUT:partNumber=1,complete,' +
      'check for parts,complete')
  expect(t.context.server.requests[7].status).to.equal(200)
})
test.todo('should check for parts when re-uploading a cached file, when getParts is not truncated without md5Checksums')

// TODO: failing because get parts logic for truncated responses is broken
test.serial.failing('should check for parts when re-uploading a cached file, when getParts is truncated', async (t) => {
  t.context.getPartsStatus = 200

  const Parts5AddConfig = {
    name: t.context.requestedAwsObjectKey,
    file: new File({
      path: '/tmp/file',
      size: 29690176,
      name: randomAwsKey()
    })
  }

  let addConfig = Object.assign({}, Parts5AddConfig, {
    computeContentMd5: true,
    cryptoMd5Method: function (data) {
      return 'md5Checksum';
    }
  })

  await t.context.testCachedParts(addConfig, 1, 0)

  expect(t.context.config.started.callCount).to.equal(1)
  expect(t.context.completedAwsKey).to.equal(t.context.requestedAwsObjectKey)
  expect(t.context.request_order).to.equal(
      'initiate,PUT:partNumber=1,PUT:partNumber=2,PUT:partNumber=3,PUT:partNumber=4,PUT:partNumber=5,complete,' +
      'check for parts,check for parts,PUT:partNumber=3,PUT:partNumber=4,PUT:partNumber=5,' +
      'complete')
  expect(t.context.server.requests[7].status).to.equal(200)
})
test.todo('should check for parts when re-uploading a cached file, when getParts is truncated without md5Checksums')

// Default Setup: V2 signatures, Cancel
// TODO: failing because the file does get uploaded
test.serial.failing('should do nothing when canceling before starting', async (t) => {
  const config = {
    started: function (id) { t.context.cancel() },
    cancelled: function () {t.context.resolve() }
  }

  await t.context.testCancel(config)

  expect(t.context.request_order).to.equal('')
})

test.serial('should Cancel an upload', async (t) => {
  await t.context.testCancel({})

  expect(t.context.config.started).to.have.been.calledOnce
  expect(t.context.config.cancelled).to.have.been.calledOnce
  expect(t.context.request_order).to.equal('initiate,PUT:partNumber=1,complete,cancel,check for parts')
})

// Default Setup: V2 signatures: Pause & Resume
// TODO: failing because Evaporate doesn't call complete()
test.serial.failing('should Start, friendly Pause and Resume an upload', async (t) => {

  await t.context.testPauseResume(false)

  expect(t.context.config.started.callCount).to.equal(2)
  expect(t.context.config.pausing.callCount).to.equal(1)
  expect(t.context.config.paused.callCount).to.equal(1)
  expect(t.context.config.resumed.callCount).to.equal(1)

  expect(t.context.request_order).to.equal('initiate,PUT:partNumber=1,check for parts,PUT:partNumber=2,complete')
  expect(t.context.completedAwsKey).to.equal(t.context.requestedAwsObjectKey)
})

// TODO: failing because Evaporate doesn't call complete()
test.serial.failing('should Start, force Pause and Resume an upload', async (t) => {
  await t.context.testPauseResume(true)

  expect(t.context.config.started.callCount).to.equal(2)
  expect(t.context.config.pausing.callCount).to.equal(1)
  expect(t.context.config.paused.callCount).to.equal(1)
  expect(t.context.config.resumed.callCount).to.equal(1)

  expect(t.context.request_order).to.equal('initiate,PUT:partNumber=1,check for parts,PUT:partNumber=2,complete')
  expect(t.context.completedAwsKey).to.equal(t.context.requestedAwsObjectKey)
})

// TODO: failing because Evaporate calls complete() twice
test.serial.failing('should re-use S3 object, if conditions are correct', async (t) => {
  await t.context.testS3Reuse({}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')

  expect(t.context.config.complete.callCount).to.equal(1)
  expect(t.context.request_order).to.equal(
      'initiate,PUT:partNumber=1,complete,HEAD')
  expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
})

// TODO: failing because Evaporate calls complete() twice
test.serial.failing('should not re-use S3 object, if the Etags do not match', async (t) => {
  await t.context.testS3Reuse({}, '"mismatched"')

  expect(t.context.config.complete.callCount).to.equal(1)
  expect(t.context.request_order).to.equal(
      'initiate,PUT:partNumber=1,complete,HEAD,initiate,PUT:partNumber=1,complete')
  expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
})

// Cover xAmzHeader Options
test.serial('should pass custom xAmzHeaders on init, put and complete', async (t) => {
  await t.context.testCommon({
    xAmzHeadersAtInitiate: { 'x-custom-header': 'peanuts' },
    xAmzHeadersAtUpload: { 'x-custom-header': 'phooey' },
    xAmzHeadersAtComplete: { 'x-custom-header': 'eindelijk' }
  })

  let request = t.context.server.requests[1] // POST INIT
  expect(request.method).to.equal('POST')
  expect(request.requestHeaders['x-custom-header']).to.equal('peanuts')

  request = t.context.server.requests[3] // PUT UPLOAD
  expect(request.method).to.equal('PUT')
  expect(request.requestHeaders['x-custom-header']).to.equal('phooey')

  request = t.context.server.requests[5] // POST COMPLETE
  expect(request.method).to.equal('POST')
  expect(request.requestHeaders['x-custom-header']).to.equal('eindelijk')
})

test.serial('should pass custom xAmzHeadersCommon headers on init, put and complete', async (t) => {
  await t.context.testCommon({
    xAmzHeadersAtInitiate: { 'x-custom-header': 'peanuts' },
    xAmzHeadersCommon: { 'x-custom-header': 'phooey' }
  })

  let request = t.context.server.requests[1] // POST INIT
  expect(request.method).to.equal('POST')
  expect(request.requestHeaders['x-custom-header']).to.equal('peanuts')

  request = t.context.server.requests[3] // PUT UPLOAD
  expect(request.method).to.equal('PUT')
  expect(request.requestHeaders['x-custom-header']).to.equal('phooey')

  request = t.context.server.requests[5] // POST COMPLETE
  expect(request.method).to.equal('POST')
  expect(request.requestHeaders['x-custom-header']).to.equal('phooey')
})

test.serial('should pass custom xAmzHeadersCommon headers that override legacy options', async (t) => {
  await t.context.testCommon({
    xAmzHeadersAtUpload: { 'x-custom-header1': 'phooey' },
    xAmzHeadersAtComplete: { 'x-custom-header2': 'phooey' },
    xAmzHeadersCommon: { 'x-custom-header3': 'phooey' }
  })

  let request = t.context.server.requests[1] // POST INIT
  expect(request.method).to.equal('POST')
  expect(request.requestHeaders['x-custom-header1']).to.equal(undefined)

  request = t.context.server.requests[3] // PUT UPLOAD
  expect(request.method).to.equal('PUT')
  expect(request.requestHeaders['x-custom-header3']).to.equal('phooey')

  request = t.context.server.requests[5] // POST COMPLETE
  expect(request.method).to.equal('POST')
  expect(request.requestHeaders['x-custom-header2']).to.eql(undefined)
  expect(request.requestHeaders['x-custom-header3']).to.eql('phooey')
})

test.serial('should pass custom xAmzHeadersCommon headers that do not apply to initiate', async (t) => {
  await t.context.testCommon({
    xAmzHeadersAtInitiate: { 'x-custom-header': 'peanuts' },
    xAmzHeadersCommon: { 'x-custom-header': 'phooey' }
  })

  let request = t.context.server.requests[1] // POST INIT
  expect(request.method).to.equal('POST')
  expect(request.requestHeaders['x-custom-header']).to.equal('peanuts')
})

// Cover xAmzHeadersCommon

// Cancel (xAmzHeadersCommon)
test.serial('should set xAmzHeadersCommon on Cancel', async (t) => {
  await t.context.testCancel({xAmzHeadersCommon: {
      'x-custom-header': 'stopped'
    }
  })

  let request = t.context.server.requests[7]
  expect(request.method).to.equal('DELETE')
  expect(request.requestHeaders['x-custom-header']).to.equal('stopped')
})

// getParts (xAmzHeadersCommon)
test.serial('should set xAmzHeadersCommon on check for parts on S3', async (t) => {
  t.context.getPartsStatus = 200

  await t.context.testCachedParts({xAmzHeadersCommon: {
    'x-custom-header': 'reused'
  }
  }, 0, 0)

  let request = t.context.server.requests[7]
  expect(request.method).to.equal('GET')
  expect(request.url).to.match(/.*\?uploadId.*$/)
  expect(request.requestHeaders['x-custom-header']).to.equal('reused')
})

// headObject (xAmzHeadersCommon)
// TODO: failing because Evaporate calls complete() twice
test.serial.failing('should set xAmzHeadersCommon when re-using S3 object', async (t) => {
  const config = {
    xAmzHeadersCommon: { 'x-custom-header': 'head-reuse' }
  }

  await t.context.testS3Reuse(config)

  let request = t.context.server.requests[7]
  expect(request.method).to.equal('HEAD')
  expect(request.requestHeaders['x-custom-header']).to.equal('head-reuse')
})
