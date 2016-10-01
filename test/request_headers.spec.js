import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

import Evaporate from '../evaporate'

import initResponse from './fixtures/init-response'
import completeResponse from './fixtures/complete-response'
import checkForPartsResponseNone from './fixtures/listparts-response-none'


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
    requestHeaders

test.beforeEach(() => {
  requestHeaders = {}
})

test.before(() => {
  sinon.xhr.supportsCORS = true
  server = sinon.fakeServer.create({
    respondImmediately: true
  })

  server.respondWith('POST', /^.*\?uploads.*$/, (xhr) => {
    requestHeaders.initiate = xhr.requestHeaders
    xhr.respond(200, CONTENT_TYPE_XML, initResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })
  server.respondWith('PUT', /^.*$/, (xhr) => {
    requestHeaders.upload = xhr.requestHeaders
    xhr.respond(200)
  })

  server.respondWith('POST', /.*\?uploadId.*$/, (xhr) => {
    requestHeaders.complete = xhr.requestHeaders
    xhr.respond(200, CONTENT_TYPE_XML, completeResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })

  server.respondWith('GET', /.*\?uploadId.*$/, (xhr) => {
    if (xhr.url.indexOf('&part-number-marker') > -1) {
      requestHeaders.getUploadParts = xhr.requestHeaders
    } else {
      requestHeaders.checkForParts = xhr.requestHeaders
    }
    xhr.respond(200, CONTENT_TYPE_XML, checkForPartsResponseNone(AWS_BUCKET, AWS_UPLOAD_KEY))
  })

  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
  })

  server.respondWith('DELETE', /.*\?uploadId.*$/, (xhr) => {
    requestHeaders.cancel = xhr.requestHeaders
    xhr.respond(204)
  })

  server.respondWith('HEAD', /./, (xhr) => {
    requestHeaders.head = xhr.requestHeaders
    xhr.respond(200, '', '')
  })

  global.XMLHttpRequest = sinon.fakeServer.xhr
  global.setTimeout = (fc) => fc()
})

test.after(() => {
  server.restore()
})

test('should pass custom xAmzHeaders', () => {
  const evaporate = new Evaporate(baseConfig)
  const addConfig = Object.assign({}, baseAddConfig, {
    xAmzHeadersAtInitiate: { 'x-custom-header': 'peanuts' },
    xAmzHeadersAtUpload: { 'x-custom-header': 'phooey' },
    xAmzHeadersAtComplete: { 'x-custom-header': 'eindelijk' }
  })

  evaporate.add(addConfig)

  expect(requestHeaders.initiate['x-custom-header']).to.eql('peanuts')
  expect(requestHeaders.upload['x-custom-header']).to.eql('phooey')
  expect(requestHeaders.complete['x-custom-header']).to.eql('eindelijk')
})

test('should pass custom xAmzHeadersCommon headers', () => {
  const evaporate = new Evaporate(baseConfig)
  const addConfig = Object.assign({}, baseAddConfig, {
    xAmzHeadersAtInitiate: { 'x-custom-header': 'peanuts' },
    xAmzHeadersCommon: { 'x-custom-header': 'phooey' }
  })

  evaporate.add(addConfig)

  expect(requestHeaders.initiate['x-custom-header']).to.eql('peanuts')
  expect(requestHeaders.upload['x-custom-header']).to.eql('phooey')
  expect(requestHeaders.complete['x-custom-header']).to.eql('phooey')
})

test('should pass custom xAmzHeadersCommon headers that override legacy options', () => {
  const evaporate = new Evaporate(baseConfig)
  const addConfig = Object.assign({}, baseAddConfig, {
    xAmzHeadersAtUpload: { 'x-custom-header1': 'phooey' },
    xAmzHeadersAtComplete: { 'x-custom-header2': 'phooey' },
    xAmzHeadersCommon: { 'x-custom-header3': 'phooey' }
  })

  evaporate.add(addConfig)

  expect(requestHeaders.upload['x-custom-header1']).to.eql(undefined)
  expect(requestHeaders.upload['x-custom-header3']).to.eql('phooey')
  expect(requestHeaders.complete['x-custom-header2']).to.eql(undefined)
  expect(requestHeaders.complete['x-custom-header3']).to.eql('phooey')
})

test('should pass custom xAmzHeadersCommon headers that do not apply to initiate', () => {
  const evaporate = new Evaporate(baseConfig)
  const addConfig = Object.assign({}, baseAddConfig, {
    xAmzHeadersAtInitiate: { 'x-custom-header': 'peanuts' },
    xAmzHeadersCommon: { 'x-custom-header': 'phooey' }
  })

  evaporate.add(addConfig)

  expect(requestHeaders.initiate['x-custom-header']).to.eql('peanuts')
})

test('should pass custom xAmzHeaders header to checkforParts (cancel/abort)', () => {
  const evaporate = new Evaporate(baseConfig)
  let uploadId

  const _handleUploadStarted = (id) => {
    uploadId = id;
  }

  const _handleUploadComplete = () => {
    evaporate.cancel(uploadId)
    expect(requestHeaders.cancel['x-custom-header']).to.eql('stopped')
    expect(requestHeaders.checkForParts['x-custom-header']).to.eql('stopped')
  }

  const config = Object.assign({}, baseAddConfig, {
    started: _handleUploadStarted,
    complete: _handleUploadComplete.bind(this),
    xAmzHeadersCommon: { 'x-custom-header': 'stopped' }
  })

  evaporate.add(config)

})

test.skip('should pass custom xAmzHeaders header to headObject', () => {
  // testing this requires access to FileReader, which isn't available...
})

test('should pass custom xAmzHeaders header to getUploadParts (Resume)', () => {
  const evapConfig = Object.assign({}, baseConfig, {
    allowS3ExistenceOptimization: true,
    s3FileCacheHoursAgo: 24
  })

  const evaporate = new Evaporate(evapConfig)

  // Upload the first time
  evaporate.add(baseAddConfig)

  const config = Object.assign({}, baseAddConfig, {
    xAmzHeadersCommon: { 'x-custom-header': 'resumed' }
  })

  // Upload the second time to trigger getParts
  requestHeaders = {};
  evaporate.add(config)

  expect(requestHeaders.getUploadParts['x-custom-header']).to.eql('resumed')
})
