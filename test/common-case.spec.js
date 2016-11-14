import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

// constants

let server

function testMd5V2(t) {
  return testBase(t, {}, { computeContentMd5: true })
}

function testMd5V4(t) {
  return testBase(t, {}, {
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

// Default Setup: V2 signatures: Common Case
test('should not call cryptoMd5 upload a file with defaults', (t) => {
  return testBase(t)
      .then(function () {
        expect(t.context.cryptoMd5.callCount).to.equal(0)
      })
})
test('should upload a file with S3 requests in the correct order', (t) => {
  return testBase(t)
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test('should upload a file and return the correct file upload ID', (t) => {
  return testBase(t)
      .then(function () {
        expect(t.context.completedAwsKey).to.equal(t.context.requestedAwsObjectKey)
      })
})

// md5Digest tests
test('V2 should call cryptoMd5 when uploading a file with defaults', (t) => {
  return testMd5V2(t)
      .then(function () {
        expect(t.context.cryptoMd5.callCount).to.equal(2)
      })
})
test('V2 should upload a file with MD5Digests with S3 requests in the correct order', (t) => {
  return testMd5V2(t)
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
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
        expect(t.context.cryptoMd5.callCount).to.equal(2)
      })
})
test('V4 should upload a file with MD5Digests with S3 requests in the correct order', (t) => {
  return testMd5V4(t)
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test('V4 should upload a file and return the correct file upload ID', (t) => {
  return testMd5V4(t)
      .then(function () {
        expect(t.context.completedAwsKey).to.equal(t.context.requestedAwsObjectKey)
      })
})

// Cover xAmzHeader Options
test('should pass xAmzHeadersAtInitiate headers', (t) => {
  return testBase(t, {
    xAmzHeadersAtInitiate: { 'x-custom-header': 'peanuts' }
  })
      .then(function () {
        expect(headersForMethod(t, 'POST', /^.*\?uploads.*$/)['x-custom-header']).to.equal('peanuts')
      })
})
test('should pass xAmzHeadersAtUpload headers', (t) => {
  return testBase(t, {
    xAmzHeadersAtUpload: { 'x-custom-header': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'PUT')['x-custom-header']).to.equal('phooey')
      })
})
test('should pass xAmzHeadersAtComplete headers', (t) => {
  return testBase(t, {
    xAmzHeadersAtComplete: { 'x-custom-header': 'eindelijk' }
  })
      .then(function () {
        expect(headersForMethod(t, 'POST', /.*\?uploadId.*$/)['x-custom-header']).to.equal('eindelijk')
      })
})

test('should not use xAmzHeadersCommon headers for Initiate', (t) => {
  return testBase(t, {
    xAmzHeadersAtInitiate: { 'x-custom-header': 'peanuts' },
    xAmzHeadersCommon: { 'x-custom-header': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'POST', /^.*\?uploads.*$/)['x-custom-header']).to.equal('peanuts')
      })
})
test('should use xAmzHeadersCommon headers for Parts', (t) => {
  return testBase(t, {
    xAmzHeadersCommon: { 'x-custom-header': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'PUT')['x-custom-header']).to.equal('phooey')
      })
})
test('should use xAmzHeadersCommon headers for Complete', (t) => {
  return testBase(t, {
    xAmzHeadersCommon: { 'x-custom-header': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'POST', /.*\?uploadId.*$/)['x-custom-header']).to.equal('phooey')
      })
})

test('should let xAmzHeadersCommon override xAmzHeadersAtUpload (1)', (t) => {
  return testBase(t, {
    xAmzHeadersAtUpload: { 'x-custom-header1': 'phooey' },
    xAmzHeadersCommon: { 'x-custom-header3': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'PUT')['x-custom-header3']).to.equal('phooey')
      })
})
test('should let xAmzHeadersCommon override xAmzHeadersAtUpload (2)', (t) => {
  return testBase(t, {
    xAmzHeadersAtUpload: { 'x-custom-header1': 'phooey' },
    xAmzHeadersCommon: { 'x-custom-header3': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'PUT')['x-custom-header1']).to.equal(undefined)
      })
})
test('should let xAmzHeadersCommon override xAmzHeadersAtComplete (1)', (t) => {
  return testBase(t, {
    xAmzHeadersAtComplete: { 'x-custom-header2': 'phooey' },
    xAmzHeadersCommon: { 'x-custom-header3': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'POST', /.*\?uploadId.*$/)['x-custom-header3']).to.equal('phooey')
      })
})
test('should let xAmzHeadersCommon override xAmzHeadersAtComplete (2)', (t) => {
  return testBase(t, {
    xAmzHeadersAtComplete: { 'x-custom-header2': 'phooey' },
    xAmzHeadersCommon: { 'x-custom-header3': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'POST', /.*\?uploadId.*$/)['x-custom-header2']).to.equal(undefined)
      })
})

// Retry on Errors
test('should retry Initiate', (t) => {
  t.context.retry = function (type) {
    return type === 'init'
  }

  return testBase(t, {})
      .then(function () {
        expect(['initiate,initiate,PUT:partNumber=1,PUT:partNumber=2,complete',
          'initiate,initiate,PUT:partNumber=2,PUT:partNumber=1,complete']).to.include('initiate,initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})

test('should retry Complete', (t) => {
  t.context.retry = function (type) {
    return type === 'complete'
  }

  return testBase(t, {})
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete,complete')
      })
})

test('should retry Upload Part', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }

  return testBase(t, { file: new File({
        path: '/tmp/file',
        size: 50,
        name: 'tests'
      })
    })
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=1,complete')
      })
})

// Retry get authorization / Initiate Upload
test('should retry get signature for common case: Initiate, Put, Complete (authorization)', (t) => {
  t.context.retry = function (type) {
    return type === 'sign'
  }

  function requestOrder() {
    let request_order = [],
        requestMap = {
          'GET:to_sign': 'sign',
          'POST:uploads': 'initiate',
          'POST:uploadId': 'complete',
          'DELETE:uploadId': 'cancel',
          'GET:uploadId': 'check for parts'
        }
    testRequests[t.context.testId].forEach(function (r) {
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

  return testBase(t, { file: new File({
      path: '/tmp/file',
      size: 50,
      name: 'tests'
    })
  })
      .then(function () {
        expect(requestOrder(t)).to.equal('sign,sign,initiate,sign,sign,PUT:partNumber=1,sign,sign,complete')
      })
})

// Failures to upload because PUT Part 404
test('should fail if PUT part 404s', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }
  t.context.errorStatus = 404

  return testBase(t)
      .then(function () {
        t.fail('Expected upload to fail but it did not.')
      })
      .catch(function (reason) {
        expect(reason).to.match(/File upload aborted/i)
      })
})
test('should call cancelled() if PUT part 404s', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }
  t.context.errorStatus = 404

  return testBase(t, { cancelled: sinon.spy() })
      .then(function () {
        t.fail('Expected upload to fail but it did not.')
      })
      .catch(function () {
        expect(t.context.config.cancelled.callCount).to.equal(1)
      })
})
test('should call the correctly ordered requests if PUT part 404s', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }
  t.context.errorStatus = 404

  return testBase(t)
      .then(function () {
        t.fail('Expected upload to fail but it did not.')
      })
      .catch(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,cancel')
      })
})
test('should fail with a message when PUT part 404s and DELETE fails', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }
  t.context.errorStatus = 404
  t.context.deleteStatus = 403

  return testBase(t, { cancelled: sinon.spy() })
      .then(function () {
        t.fail('Expected upload to fail but it did not.')
      })
      .catch(function (reason) {
        expect(reason).to.match(/Error aborting upload/i)
      })
})
test('should fail with the correctly ordered requests when PUT part 404s and DELETE fails', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }
  t.context.errorStatus = 404
  t.context.deleteStatus = 403

  return testBase(t, { cancelled: sinon.spy() })
      .then(function () {
        t.fail('Expected upload to fail but it did not.')
      })
      .catch(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,cancel,cancel')
      })
})
