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
  abortCompletionThrottlingMs: 0
}

const baseAddConfig = {
  name: AWS_UPLOAD_KEY,
  file: new File({
    path: '/tmp/file',
    size: 50
  })
}

let server,
    authorization,
    statusPUT,
    statusDELETE,
    statusLIST,
    signerUrlCalled,
    errMessages;

test.before(() => {
  sinon.xhr.supportsCORS = true

  global.XMLHttpRequest = sinon.useFakeXMLHttpRequest()

  global.window = {
   localStorage: {}
  };

})

test.beforeEach(() =>{
  signerUrlCalled = false;
  authorization = undefined;
  statusPUT = 200
  statusDELETE = 200
  statusLIST = 200
  errMessages = []
  localStorage.removeItem('awsUploads')

  server = sinon.fakeServer.create({
    autoRespond: true
  })

  server.respondWith('GET', /\/signv4.*$/, (xhr) => {
    signerUrlCalled = true
    xhr.respond(200, CONTENT_TYPE_TEXT, '12345678901234567890123456v4')
  })

  server.respondWith('GET', /\/signv2.*$/, (xhr) => {
    signerUrlCalled = true
    xhr.respond(200, CONTENT_TYPE_TEXT, '1234567890123456789012345678')
  })

  server.respondWith('POST', /^.*\?uploads.*$/, (xhr) => {
    authorization = xhr.requestHeaders.Authorization
    xhr.respond(200, CONTENT_TYPE_XML, initResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })

  server.respondWith('PUT', /^.*$/, (xhr) => {
    xhr.respond(statusPUT)
  })

  server.respondWith('POST', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(200, CONTENT_TYPE_XML, completeResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })

  server.respondWith('DELETE', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(statusDELETE, CONTENT_TYPE_TEXT)
  })

  server.respondWith('GET', /.*\?uploadId.*$/, (xhr) => {
    var response;
    response = getPartsResponse(AWS_BUCKET, AWS_UPLOAD_KEY, 0, 0)
    xhr.respond(statusLIST, CONTENT_TYPE_XML, response)
  })

})

test.after(() => {
  server.restore()
})

async function testV2Authorization(initConfig, expectedErrors, addCfg) {
  const config = Object.assign({}, baseConfig, {awsSignatureVersion: '2', signerUrl: 'http://what.ever/signv2'})
  const evapV2Config = Object.assign({}, config, initConfig)

  var deferred = defer();

  const evaporate = new Evaporate(evapV2Config)

  if (arguments.length === 1) {
    expectedErrors = 0;
  }

  const addConfig = Object.assign({}, baseAddConfig, addCfg, {
    complete: function () { deferred.resolve();},
    error: function (msg) {
      errMessages.push(msg);
      if (errMessages.length >= expectedErrors) {
        deferred.resolve();
      }
    }})

  evaporate.add(addConfig)

  await deferred.promise
}

function v2Authorization(signature) {
  return 'AWS testkey:' + signature
}
function v4Authorization(signingKey) {
  return 'AWS4-HMAC-SHA256 Credential=testkey/' + v4DateString() + '/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-date, Signature=' + signingKey
}
function v4DateString() {
  return new Date().toISOString().slice(0, 10).replace(/-|:/g, '')
}

let AWSLambda = function (payload) {
  this.payload = payload;
}
AWSLambda.prototype.invoke = function (params, cb) {
  const data = {
    Payload: '"' + this.payload + '"'
  }
  cb('', data)
}

async function testV4Authorization(initConfig, addCfg) {
  const config = Object.assign({}, baseConfig, {
    signerUrl: 'http://what.ever/signv4',
    awsSignatureVersion: '4',
    computeContentMd5: true,
    cryptoMd5Method: function () { return 'MD5Value'; },
    cryptoHexEncodedHash256: function () { return 'SHA256Value'; }
  })

  var deferred = defer();

  const evapV4Config = Object.assign({}, config, initConfig)

  const evaporate = new Evaporate(evapV4Config)

  const addConfig = Object.assign({}, baseAddConfig, addCfg, {
    complete: function () { deferred.resolve() },
    error: function (msg) { errMessages.push(msg) }})

  evaporate.add(addConfig)

  await deferred.promise
}

async function testV4ToSign(addConfig) {
  await testV4Authorization({cryptoHexEncodedHash256: function (d) { return d; }}, addConfig);

  var qp = params(server.requests[2].url)

  return {
    result: qp.to_sign,
    datetime: qp.datetime
  }
}

const signResponseHandler = function  (response, stringToSign, signatureDateTime) {
  return '1234567890123456789012345srh';
}

function params(url) {
  var query = url.split("?"),
   qs = query[1] || '',
   pairs = qs.split("&"),
   result = {};
  pairs.forEach(function (r) {
    var pr = r.split("=");
    if (pr.length === 1) {
      result[pr[0]] = null;
    } else {
      result[pr[0]] = pr[1];
    }
  });
  return result;
}

function stringToSignV2(path, method, request) {

  var x_amz_headers = '', result, header_key_array = [];

  for (var key in request.x_amz_headers) {
    if (request.x_amz_headers.hasOwnProperty(key)) {
      header_key_array.push(key);
    }
  }
  header_key_array.sort();

  header_key_array.forEach(function (header_key) {
    x_amz_headers += (header_key + ':' + request.x_amz_headers[header_key] + '\n');
  });

  result = method + '\n' +
      (request.md5_digest || '') + '\n' +
      (request.contentType || '') + '\n' +
      '\n' +
      x_amz_headers +
      '' +
      path;

  return result;
}

async function testV2ToSign(request, amzHeaders, addConfig, evapConfig) {
  await testV2Authorization(evapConfig, 0, addConfig);

  var qp = params(server.requests[2].url),
      h = Object.assign({}, amzHeaders, {'x-amz-date': qp.datetime}),
      r = Object.assign({}, request, {x_amz_headers: h}),
      expected = encodeURIComponent(stringToSignV2('/' + AWS_BUCKET + '/' + AWS_UPLOAD_KEY +
          '?partNumber=1&uploadId=Hzr2sK034dOrV4gMsYK.MMrtWIS8JVBPKgeQ.LWd6H8V2PsLecsBqoA1cG1hjD3G4KRX_EBEwxWWDu8lNKezeA--', 'PUT', r))

  return {
    result: qp.to_sign,
    expected: expected
  }
}

test.serial('should correctly create V2 string to sign for PUT', async () => {
  var result = await testV2ToSign();
  expect(result.result).to.equal(result.expected)
})

test.serial('should correctly create V2 string to sign for PUT with amzHeaders', async () => {
  var result = await testV2ToSign({}, { 'x-custom-header': 'peanuts' }, {xAmzHeadersCommon: { 'x-custom-header': 'peanuts' }});
  expect(result.result).to.equal(result.expected)
})

test.serial('should correctly create V2 string to sign for PUT with md5 digest', async () => {
  var result = await testV2ToSign({md5_digest: 'MD5Value'}, {}, {}, {
    computeContentMd5: true,
    cryptoMd5Method: function () { return 'MD5Value'; }
  });
  expect(result.result).to.equal(result.expected)
})

test.serial('should correctly create V4 string to sign for PUT', async () => {
  var result = await testV4ToSign();
  expect(result.result).to.equal('AWS4-HMAC-SHA256%0A' + result.datetime + '%0A' +
      result.datetime.slice(0, 8) + '%2Fus-east-1%2Fs3%2Faws4_request%0APUT%0A%2F%0A%0Acontent-md5%3AMD5Value%0Ahost%3As3.amazonaws.com%0Ax-amz-date%3A' +
      result.datetime + '%0A%0Acontent-md5%3Bhost%3Bx-amz-date%0AUNSIGNED-PAYLOAD')
})

test.serial('should correctly create V4 string to sign for PUT with amzHeaders', async () => {
  var result = await testV4ToSign({xAmzHeadersCommon: { 'x-custom-header': 'peanuts' }});

  expect(result.result).to.equal('AWS4-HMAC-SHA256%0A' + result.datetime + '%0A' +
      result.datetime.slice(0, 8) + '%2Fus-east-1%2Fs3%2Faws4_request%0APUT%0A%2F%0A%0Acontent-md5%3AMD5Value%0Ahost%3As3.amazonaws.com%0Ax-amz-date%3A' +
      result.datetime + '%0Ax-custom-header%3Apeanuts%0A%0Acontent-md5%3Bhost%3Bx-amz-date%3Bx-custom-header%0AUNSIGNED-PAYLOAD')
})

test.serial('should fetch V2 authorization from the signerUrl', async () => {
  await testV2Authorization({});

  expect(errMessages.length).to.equal(0)
  expect(signerUrlCalled).to.equal(true)
  expect(authorization).to.equal(v2Authorization('1234567890123456789012345678'))
})

test.serial('should fetch V2 authorization using the signResponseHandler even with signerUrl', async () => {
  await testV2Authorization({signResponseHandler: signResponseHandler})

  expect(errMessages.length).to.equal(0)
  expect(signerUrlCalled).to.equal(true)
  expect(authorization).to.equal(v2Authorization('1234567890123456789012345srh'))
})

test.serial('should fetch V2 authorization using the signResponseHandler without signerUrl', async () => {
  await testV2Authorization({signerUrl: undefined, signResponseHandler: signResponseHandler})

  expect(errMessages.length).to.equal(0)
  expect(signerUrlCalled).to.equal(false)
  expect(authorization).to.equal(v2Authorization('1234567890123456789012345srh'))
})

test.serial('should fetch V4 authorization from the signerUrl', async () => {
  await testV4Authorization({})

  expect(errMessages.length).to.equal(0)
  expect(signerUrlCalled).to.equal(true)
  expect(authorization).to.equal(v4Authorization('12345678901234567890123456v4'))
})

test.serial('should fetch V4 authorization using the signResponseHandler even with signerUrl', async () => {
  await testV4Authorization({signResponseHandler: signResponseHandler})

  expect(errMessages.length).to.equal(0)
  expect(signerUrlCalled).to.equal(true)
  expect(authorization).to.equal(v4Authorization('1234567890123456789012345srh'))
})

test.serial('should fetch V4 authorization using the signResponseHandler without signerUrl', async () => {
  await testV4Authorization({signerUrl: undefined, signResponseHandler: signResponseHandler})

  expect(errMessages.length).to.equal(0)
  expect(signerUrlCalled).to.equal(false)
  expect(authorization).to.equal(v4Authorization('1234567890123456789012345srh'))
})

test.serial('should fetch V2 authorization using awsLambda', async () => {
  await testV2Authorization({awsLambda: new AWSLambda('abcdLambdaV2'), awsLambdaFunction: function () {}})

  expect(errMessages.length).to.equal(0)
  expect(signerUrlCalled).to.equal(false)
  expect(authorization).to.equal(v2Authorization('abcdLambdaV2'))
})

test.serial('should fetch V4 authorization using awsLambda', async () => {
  await testV4Authorization({awsLambda: new AWSLambda('abcdLambdaV4'), awsLambdaFunction: function () {}})

  expect(errMessages.length).to.equal(0)
  expect(signerUrlCalled).to.equal(false)
  expect(authorization).to.equal(v4Authorization('abcdLambdaV4'))
})

// Auth Error Handling

test.serial('should abort on 404 in V2 Signature PUT', async () => {
  statusPUT = 404
  await testV2Authorization({}, 1)

  expect(signerUrlCalled).to.equal(true)
  expect(errMessages.join(',')).to.equal('404 error on part PUT. The part and the file will abort.')
})

test.serial('should return error when ABORT fails', async () => {
  statusPUT = 404
  statusDELETE = 403
  await testV2Authorization({}, 2)

  expect(signerUrlCalled).to.equal(true)
  expect(errMessages.join(',')).to.match(/404 error on part PUT\. The part and the file will abort/)
  expect(errMessages.join(',')).to.match(/Error aborting upload: status:403/)
})

test.serial('should return error when list parts fails', async () => {
  statusPUT = 404
  statusLIST = 403
  await testV2Authorization({}, 2)

  expect(signerUrlCalled).to.equal(true)
  expect(errMessages.join(',')).to.match(/404 error on part PUT\. The part and the file will abort/)
  expect(errMessages.join(',')).to.match(/Error listing parts/)
})

test.serial('should return error when Abort fails after part upload failure (404)', async () => {
  statusPUT = 404
  statusDELETE = 403
  await testV2Authorization({}, 2)

  expect(signerUrlCalled).to.equal(true)
  expect(errMessages.join(',')).to.match(/404 error on part PUT\. The part and the file will abort/)
  expect(errMessages.join(',')).to.match(/Error aborting upload: status:403/)
})

test.serial('should return error when listParts fails in Abort after part upload failure (404)', async () => {
  statusPUT = 404
  statusDELETE = 200
  statusLIST = 403
  await testV2Authorization({}, 2)

  expect(signerUrlCalled).to.equal(true)
  expect(errMessages.join(',')).to.match(/404 error on part PUT\. The part and the file will abort/)
  expect(errMessages.join(',')).to.match(/Error listing parts/)
})
