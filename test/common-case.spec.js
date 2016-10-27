import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

// constants

let server

function testCommonCase(t, addConfig, evapConfig) {

  let leagcyAmzHeaders = false, c;
  if (addConfig.xAmzHeadersAtInitiate) {
    c = Object.assign({}, t.context.baseAddConfig.xAmzHeadersAtInitiate, addConfig.xAmzHeadersAtInitiate)
    addConfig.xAmzHeadersAtInitiate = c
  }

  if (addConfig.xAmzHeadersAtUpload) {
    leagcyAmzHeaders = true
    c = Object.assign({}, t.context.baseAddConfig.xAmzHeadersCommon, addConfig.xAmzHeadersAtUpload)
    addConfig.xAmzHeadersAtUpload = c
    if (addConfig.xAmzHeadersCommon) {
      c = Object.assign({}, t.context.baseAddConfig.xAmzHeadersCommon, addConfig.xAmzHeadersCommon)
      addConfig.xAmzHeadersCommon = c
    }
  }
  if (addConfig.xAmzHeadersAtComplete) {
    leagcyAmzHeaders = true
    c = Object.assign({}, t.context.baseAddConfig.xAmzHeadersCommon, addConfig.xAmzHeadersAtComplete)
    addConfig.xAmzHeadersAtComplete = c
    if (addConfig.xAmzHeadersCommon) {
      c = Object.assign({}, t.context.baseAddConfig.xAmzHeadersCommon, addConfig.xAmzHeadersCommon)
      addConfig.xAmzHeadersCommon = c
    }
  }

  if (leagcyAmzHeaders) {
    delete t.context.baseAddConfig.xAmzHeadersCommon
  } else {
    c = Object.assign({}, t.context.baseAddConfig.xAmzHeadersCommon, addConfig.xAmzHeadersCommon)
    addConfig.xAmzHeadersCommon = c
  }

  return testBase(t, addConfig, evapConfig)
}

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
  let testId = 'common-case/' + t.title
  if (testId in testContext) {
    console.error('Test case must be uniquely named:', t.title)
    return
  }

  t.context.testId = testId
  t.context.requestedAwsObjectKey = randomAwsKey()
  t.context.requests = []

  t.context.attempts = 0
  t.context.maxRetries = 1
  t.context.retry = function (type) {}

  t.context.baseAddConfig = {
    name: t.context.requestedAwsObjectKey,
    file: new File({
      path: '/tmp/file',
      size: 12000000,
      name: randomAwsKey()
    }),
    xAmzHeadersAtInitiate: {testId: testId},
    xAmzHeadersCommon: { testId: testId },
    maxRetryBackoffSecs: 0.1,
    abortCompletionThrottlingMs: 0
  }

  t.context.cryptoMd5 = sinon.spy(function () { return 'md5Checksum'; })

  testContext[testId] = t.context
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
  return testCommonCase(t, {
    xAmzHeadersAtInitiate: { 'x-custom-header': 'peanuts' }
  })
      .then(function () {
        expect(headersForMethod(t, 'POST', /^.*\?uploads.*$/)['x-custom-header']).to.equal('peanuts')
      })
})
test('should pass xAmzHeadersAtUpload headers', (t) => {
  return testCommonCase(t, {
    xAmzHeadersAtUpload: { 'x-custom-header': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'PUT')['x-custom-header']).to.equal('phooey')
      })
})
test('should pass xAmzHeadersAtComplete headers', (t) => {
  return testCommonCase(t, {
    xAmzHeadersAtComplete: { 'x-custom-header': 'eindelijk' }
  })
      .then(function () {
        expect(headersForMethod(t, 'POST', /.*\?uploadId.*$/)['x-custom-header']).to.equal('eindelijk')
      })
})

test('should not use xAmzHeadersCommon headers for Initiate', (t) => {
  return testCommonCase(t, {
    xAmzHeadersAtInitiate: { 'x-custom-header': 'peanuts' },
    xAmzHeadersCommon: { 'x-custom-header': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'POST', /^.*\?uploads.*$/)['x-custom-header']).to.equal('peanuts')
      })
})
test('should use xAmzHeadersCommon headers for Parts', (t) => {
  return testCommonCase(t, {
    xAmzHeadersCommon: { 'x-custom-header': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'PUT')['x-custom-header']).to.equal('phooey')
      })
})
test('should use xAmzHeadersCommon headers for Complete', (t) => {
  return testCommonCase(t, {
    xAmzHeadersCommon: { 'x-custom-header': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'POST', /.*\?uploadId.*$/)['x-custom-header']).to.equal('phooey')
      })
})

test('should let xAmzHeadersCommon override xAmzHeadersAtUpload (1)', (t) => {
  return testCommonCase(t, {
    xAmzHeadersAtUpload: { 'x-custom-header1': 'phooey' },
    xAmzHeadersCommon: { 'x-custom-header3': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'PUT')['x-custom-header3']).to.equal('phooey')
      })
})
test('should let xAmzHeadersCommon override xAmzHeadersAtUpload (2)', (t) => {
  return testCommonCase(t, {
    xAmzHeadersAtUpload: { 'x-custom-header1': 'phooey' },
    xAmzHeadersCommon: { 'x-custom-header3': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'PUT')['x-custom-header1']).to.equal(undefined)
      })
})
test('should let xAmzHeadersCommon override xAmzHeadersAtComplete (1)', (t) => {
  return testCommonCase(t, {
    xAmzHeadersAtComplete: { 'x-custom-header2': 'phooey' },
    xAmzHeadersCommon: { 'x-custom-header3': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'POST', /.*\?uploadId.*$/)['x-custom-header3']).to.equal('phooey')
      })
})
test('should let xAmzHeadersCommon override xAmzHeadersAtComplete (2)', (t) => {
  return testCommonCase(t, {
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

  return testCommonCase(t, {})
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})

test('should retry Complete', (t) => {
  t.context.retry = function (type) {
    return type === 'complete'
  }

  return testCommonCase(t, {})
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete,complete')
      })
})

test('should retry Upload Part', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }

  return testCommonCase(t, { file: new File({
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

  return testCommonCase(t, { file: new File({
      path: '/tmp/file',
      size: 50,
      name: 'tests'
    })
  })
      .then(function () {
        expect(requestOrder(t)).to.equal('sign,sign,initiate,sign,sign,PUT:partNumber=1,sign,sign,complete')
      })
})
