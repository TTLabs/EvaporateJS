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
  server = sinon.fakeServer.create({
    respondImmediately: true
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

  global.XMLHttpRequest = sinon.fakeServer.xhr
  global.setTimeout = (fc) => fc()

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
})

test.after(() => {
  server.restore()
})

async function testV2Authorization(initConfig, expectedErrors) {
  const config = Object.assign({}, baseConfig, {awsSignatureVersion: '2', signerUrl: 'http://what.ever/signv2'})
  const evapV2Config = Object.assign({}, config, initConfig)

  var deferred = defer();

  const evaporate = new Evaporate(evapV2Config)

  if (arguments.length === 1) {
    expectedErrors = 0;
  }

  const addConfig = Object.assign({}, baseAddConfig, {
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

async function testV4Authorization(initConfig) {
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

  const addConfig = Object.assign({}, baseAddConfig, {
    complete: function () { deferred.resolve() },
    error: function (msg) { errMessages.push(msg) }})

  evaporate.add(addConfig)

  await deferred.promise
}

const signResponseHandler = function  (response, stringToSign, signatureDateTime) {
  return '1234567890123456789012345srh';
}

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

test.serial.skip('should fetch V2 authorization using awsLambda', async () => {
  await testV2Authorization({awsLambda: new AWSLambda('abcdLambdaV2'), awsLambdaFunction: function () {}})

  expect(errMessages.length).to.equal(0)
  expect(signerUrlCalled).to.equal(false)
  expect(authorization).to.equal(v2Authorization('abcdLambdaV2'))
})

test.serial.skip('should fetch V4 authorization using awsLambda', async () => {
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
  expect(errMessages.join(',')).to.equal('404 error on part PUT. The part and the file will abort.,Error aborting upload.')
})

test.serial('should return error when list parts fails', async () => {
  statusPUT = 404
  statusLIST = 403
  await testV2Authorization({}, 2)

  expect(signerUrlCalled).to.equal(true)
  expect(errMessages.join(',')).to.equal('404 error on part PUT. The part and the file will abort.,Error listing parts.')
})

test.serial('should return error when Abort fails after part upload failure (404)', async () => {
  statusPUT = 404
  statusDELETE = 403
  await testV2Authorization({}, 2)

  expect(signerUrlCalled).to.equal(true)
  expect(errMessages.join(',')).to.equal('404 error on part PUT. The part and the file will abort.,Error aborting upload.')
})

test.serial('should return error when listParts fails in Abort after part upload failure (404)', async () => {
  statusPUT = 404
  statusDELETE = 200
  statusLIST = 403
  await testV2Authorization({}, 1)

  expect(signerUrlCalled).to.equal(true)
  expect(errMessages.join(',')).to.equal('404 error on part PUT. The part and the file will abort.,Error listing parts.')
})
