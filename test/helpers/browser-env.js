import { DOMParser } from 'xmldom'
import { jsdom } from 'jsdom'
import { File } from 'file-api'
import Evaporate from '../../evaporate'
import sinon from 'sinon'
import initResponse from '../fixtures/init-response'
import completeResponse from '../fixtures/complete-response'
import getPartsResponse from '../fixtures/get-parts-truncated-response'

const CONTENT_TYPE_XML = { 'Content-Type': 'text/xml' }
const CONTENT_TYPE_TEXT = { 'Content-Type': 'text/plain' }

const AWS_UPLOAD_KEY = 'tests'

global.document = jsdom('<body></body>')
global.DOMParser = DOMParser

File.prototype.slice = function (start = 0, end = null, contentType = '') {
  if (!end) {
    end = this.size
  }
  return new File({
    size: end - start,
    path: this.path,
    name: this.name,
    type: this.type || contentType
  })
}

global.File = File
global.Blob = File

let FileReaderMock = function () {}
FileReaderMock.prototype.onloadend = function () {}
FileReaderMock.prototype.readAsArrayBuffer = function () { this.onloadend(); }

global.FileReader = FileReaderMock;

global.AWS_BUCKET = 'bucket'
global.AWS_UPLOAD_KEY = 'tests'

const baseConfig = {
  signerUrl: 'http://what.ever/sign',
  aws_key: 'testkey',
  bucket: AWS_BUCKET,
  logging: false,
  maxRetryBackoffSecs: 0.1,
  abortCompletionThrottlingMs: 0,
  enablePartSizeOptimization: false
}

function LocalStorage() {
  this.cache = {};
  this.getItem = function (key) {
    return this.cache[key];
  };
  this.setItem = function (key, value) {
    return this.cache[key] = value;
  };
  this.removeItem = function (key) {
    delete this.cache[key];
  };
}

global.localStorage = new LocalStorage();

global.testRequests = {}
global.testContext = {}

global.randomAwsKey = function () {
  return Math.random().toString().substr(2) + '_' + AWS_UPLOAD_KEY
}

let requestMap = {
  'POST:uploads': 'initiate',
  'POST:uploadId': 'complete',
  'DELETE:uploadId': 'cancel',
  'GET:uploadId': 'check for parts',
  'PUT': 'put object'
}

global.requestOrder = function (t) {
  var result = []
  let r = testRequests[t.context.testId]
  r.forEach(function (r) {
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
      result.push(requestMap[v] || v)
    }
  })

  return result.join(',')
}

global.headersForMethod = function(t, method, urlRegex) {
  var r = urlRegex || /./
  let requests = testRequests[t.context.testId]
  for (var i = 0; i < requests.length; i++) {
    var xhr = requests[i]
    if (xhr.method === method && xhr.url.match(r)) {
      return xhr.requestHeaders
    }
  }
  return {}
}

global.serverCommonCase = function (partRequestHandler) {

  let server = sinon.fakeServer.create({
    respondImmediately: true
  })

  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    storeTestRequest(xhr)
    let payload
    payload = Array(29).join()
    if (xhr.url.match(/\/signv4.*$/)) {
      payload = '12345678901234567890123456v4'
    } else if (xhr.url.match(/\/signv2.*$/)) {
      payload = '1234567890123456789012345678'
    }
    xhr.respond(retryStatus(xhr, 'sign'), CONTENT_TYPE_TEXT, payload)
  })

  server.respondWith('POST', /^.*\?uploads.*$/, (xhr) => {
    let context = storeTestRequest(xhr)
    context.authorization = xhr.requestHeaders.Authorization
    xhr.respond(retryStatus(xhr, 'init'), CONTENT_TYPE_XML, initResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })

  server.respondWith('PUT', /^.*$/, (xhr) => {
    let context = storeTestRequest(xhr)

    if (typeof partRequestHandler === 'function') {
      if (typeof partRequestHandler(xhr, context) === 'undefined') {
        return;
      }
    }
    let status = retryStatus(xhr, 'part'),
        errResponse = `
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
    storeTestRequest(xhr)
    xhr.respond(retryStatus(xhr, 'complete'), CONTENT_TYPE_XML, completeResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })

  server.respondWith('GET', /.*\?uploadId.*$/, (xhr) => {
    let context = storeTestRequest(xhr)
    let maxParts = context.maxGetParts || 0,
        marker = context.partNumberMarker || 0,
        status

    if (context.getPartsStatus === 404) {
      status = context.getPartsStatus
    } else {
      status = context.getPartsStatus || 200
    }

    xhr.respond(status, CONTENT_TYPE_XML, getPartsResponse(AWS_BUCKET, AWS_UPLOAD_KEY, maxParts, marker++))
    if (typeof context.partNumberMarker !== 'undefined') {
      context.partNumberMarker = marker;
    }
  })

  server.respondWith('DELETE', /.*\?uploadId.*$/, (xhr) => {
    let context = storeTestRequest(xhr)
    if (context.deleteStatus === 404) {
      xhr.respond(context.deleteStatus)
    } else {
      xhr.respond(context.deleteStatus || 204)
    }
  })

  server.respondWith('HEAD', /./, (xhr) => {
    let context = storeTestRequest(xhr)
    if (context.headStatus === 404) {
      xhr.respond(context.headStatus)
    } else {
      xhr.respond(context.headStatus, {eTag: context.headEtag || 'custom-eTag'}, '')
    }
  })

  server.respondWith('GET', /\/time.*$/, (xhr) => {
    let match = xhr.url.match(/testId=(.+)\?/),
        payload
    if (match) {
      let testId = match[1],
          context = storeTestRequest(xhr, testId)
      if (typeof context.timeUrlCalled === 'undefined') {
        context.timeUrlCalled = 0
      }
      context.timeUrlCalled += 1
      payload = (context.timeUrlDate || new Date()).toISOString()
    }
    xhr.respond(retryStatus(xhr, 'time'), CONTENT_TYPE_TEXT, payload)
  })

  function getContext(testId) {
    return testContext[testId]
  }

  function storeTestRequest(xhr, k) {
    k = k || xhr.requestHeaders.testId
    testRequests[k] = testRequests[k] || []
    testRequests[k].push(xhr)
    return getContext(k)
  }

  function retryStatus(xhr, type, successStatus) {
    let context = getContext(xhr.requestHeaders.testId),
        status;
    if (!context) {
      return successStatus || 200
    }
    if (context.retry(type)) {

      context.attempts += 1
      if (context.attempts > context.maxRetries) {
        status = 200
        context.attempts = 0
      } else {
        status = context.errorStatus || 403
      }
    }
    return status
  }
}

global.beforeEachSetup = function (t, file) {
  let testId = t.title
  if (testId in testContext) {
    console.error('Test case must be uniquely named:', testId)
    return
  }

  t.context.testId = testId
  t.context.requestedAwsObjectKey = randomAwsKey()
  t.context.requests = []
  t.context.errMessages = []

  t.context.attempts = 0
  t.context.maxRetries = 1
  t.context.retry = function (type) {}

  let addFile = file || new File({
        path: '/tmp/file',
        size: 12000000,
        name: randomAwsKey()
      })

  t.context.baseAddConfig = {
    name: t.context.requestedAwsObjectKey,
    file: addFile,
    maxRetryBackoffSecs: 0.1,
    abortCompletionThrottlingMs: 0
  }

  t.context.cryptoMd5 = sinon.spy(function () { return 'md5Checksum' })
  t.context.cryptoHexEncodedHash256 = sinon.spy(function () { return 'SHA256Value' })


  testContext[testId] = t.context
}

global.newEvaporate = function (t, evapConfig) {
  evapConfig = evapConfig || {}
  t.context.evaporate = new Evaporate(Object.assign({}, baseConfig,
      {cryptoMd5Method: t.context.cryptoMd5}, evapConfig,  {
        signHeaders: Object.assign({
          testId: t.context.testId
        }, evapConfig.signHeaders)
      }))
  return t.context.evaporate;
}

global.evaporateAdd = function (t, evaporate, addConfig, configOverrides) {
  if (typeof addConfig.started === "function") {
    addConfig.user_started = addConfig.started;
    delete addConfig.started;
  }

  if (typeof addConfig.complete === "function") {
    addConfig.user_complete = addConfig.complete;
    delete addConfig.complete;
  }

  addConfig.xAmzHeadersAtInitiate = Object.assign({
    testId: t.context.testId
  }, addConfig.xAmzHeadersAtInitiate)

  if (addConfig.xAmzHeadersAtUpload || addConfig.xAmzHeadersAtComplete) {
    addConfig.xAmzHeadersAtUpload = Object.assign({ testId: t.context.testId }, addConfig.xAmzHeadersAtUpload)

    addConfig.xAmzHeadersAtComplete = Object.assign({ testId: t.context.testId }, addConfig.xAmzHeadersAtComplete)

    if (addConfig.xAmzHeadersCommon) {
      addConfig.xAmzHeadersCommon = Object.assign({}, { testId: t.context.testId }, addConfig.xAmzHeadersCommon)
    }

  } else {
    addConfig.xAmzHeadersCommon = Object.assign({}, { testId: t.context.testId }, addConfig.xAmzHeadersCommon)
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
    })
  })

  return evaporate.add(t.context.config, configOverrides || {})

}
global.testBase = function (t, addConfig, evapConfig) {
  addConfig = addConfig || {}
  evapConfig = evapConfig || {}

  t.context.evapConfig = Object.assign({}, baseConfig,
      {cryptoMd5Method: t.context.cryptoMd5}, evapConfig,  {
        signHeaders: Object.assign({
          testId: t.context.testId
        }, evapConfig.signHeaders)
      })

  let configOverrides = addConfig.configOverrides;

  return Evaporate.create(t.context.evapConfig)
      .then(function (evaporate) {
        t.context.evaporate = evaporate

        return evaporateAdd(t, evaporate, addConfig, configOverrides)
      })
}
