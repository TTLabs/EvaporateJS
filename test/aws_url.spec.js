import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

import Evaporate from '../evaporate'

import initResponse from './fixtures/init-response'
import completeResponse from './fixtures/complete-response'


// consts

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
    maxRetryBackoffSecs: 0.1,
    abortCompletionThrottlingMs: 0
  })
}

let server

test.before(() => {
  sinon.xhr.supportsCORS = true
  server = sinon.fakeServer.create({
    autoRespond: true
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

  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
  })

  server.respondWith('DELETE', /.*\?uploadId.*$/, (xhr) => {
    xhr.respond(204)
  })

  global.XMLHttpRequest = sinon.fakeServer.xhr
})

test.after(() => {
  server.restore()
})

// test that AWS Url obeys the contract

function testAwsUrl(obj, t, input, expected) {
  const evapConfig = Object.assign({}, baseConfig, input)

  const evaporate = new Evaporate(evapConfig)

  const _handleUploadComplete = (xhr) => {
    expect(xhr.url).to.include(expected)
    t.end()
  }

  const config = Object.assign({}, baseAddConfig, {
    complete: _handleUploadComplete.bind(obj),
  })

  evaporate.add(config)
}

// cloudfront, aws_url, awsRegion and s3Acceleration

test.cb('should respect awsRegion and cloudfront when not defined', (t) => {
  testAwsUrl(this, t, {}, 'https://s3.amazonaws.com/bucket/')
})

test.cb('should respect awsRegion and cloudfront when false', (t) => {
  testAwsUrl(this, t, { cloudfront: false }, 'https://s3.amazonaws.com/bucket/')
})

test.cb('should respect awsRegion and cloudfront when true', (t) => {
  testAwsUrl(this, t, { cloudfront: true }, 'https://bucket.s3.amazonaws.com')
})

// awsRegions

test.cb('should respect awsRegion not us-east-1', (t) => {
  testAwsUrl(this, t, { awsRegion: 'eu-central-1' }, 'https://s3-eu-central-1.amazonaws.com/bucket/')
})

test.cb('should respect awsRegion not us-east-1 with cloudfront', (t) => {
  testAwsUrl(this, t, { awsRegion: 'eu-central-1', cloudfront: true }, 'https://bucket.s3-eu-central-1.amazonaws.com/')
})

// aws_url
test.cb('should respect aws_url if presented wihtout cloudfront', (t) => {
  testAwsUrl(this, t, { awsRegion: 'eu-central-1', aws_url: 'https://s3.dualstack.us-east-1.amazonaws.com' }, 'https://s3.dualstack.us-east-1.amazonaws.com/bucket/')
})

test.cb('should respect aws_url if presented with cloudfront', (t) => {
  testAwsUrl(this, t, { awsRegion: 'eu-central-1', aws_url: 'https://bucket.s3.dualstack.us-east-1.amazonaws.com' }, 'https://bucket.s3.dualstack.us-east-1.amazonaws.com/')
})

// S3 Transfer Acceleration

test.cb('should respect s3Acceleration with defaults', (t) => {
  testAwsUrl(this, t, { s3Acceleration: true }, 'https://bucket.s3-accelerate.amazonaws.com/')
})

test.cb('should respect s3Acceleration with region outside of us-east-1', (t) => {
  testAwsUrl(this, t, { s3Acceleration: true, awsRegion: 'eu-central-1' }, 'https://bucket.s3-accelerate.amazonaws.com/')
})
