import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

import Evaporate from '../evaporate'

import initResponse from './fixtures/init-response'
import completeResponse from './fixtures/complete-response'


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
    requestHeaders = {}

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

  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
  })

  server.respondWith('DELETE', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(204)
  })

  global.XMLHttpRequest = sinon.fakeServer.xhr
  global.setTimeout = (fc) => fc()
})

test.after(() => {
  server.restore()
})

test('should pass custom headers', () => {
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
