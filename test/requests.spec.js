import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

import Evaporate from '../evaporate'

import initResponse from './fixtures/init-response'
import completeResponse from './fixtures/complete-response'
import checkForPartsResponseNone from './fixtures/listparts-response-none'
import checkForPartsResponseSome from './fixtures/checkforparts-response-some'


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
    requests,
    recheckForParts

test.beforeEach(() => {
  requests = []
  recheckForParts = false
})

test.before(() => {
  sinon.xhr.supportsCORS = true
  server = sinon.fakeServer.create({
    respondImmediately: true
  })

  server.respondWith('POST', /^.*\?uploads.*$/, (xhr) => {
    requests.push('initiate');
    xhr.respond(200, CONTENT_TYPE_XML, initResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })
  server.respondWith('PUT', /^.*$/, (xhr) => {

    var headers = {
      'Access-Control-Allow-Credentials': true,
      'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, HEAD',
      'Access-Control-Allow-Origin': 'http://localhost',
      'Access-Control-Expose-Headers': 'ETag',
      'Content-Length': 0,
      'Date': 'Sun, 02 Oct 2016 11:04:59 GMT',
      'ETag': '"a9bc4abeb79b20492dd2a7e102720032"',
      'Server': 'AmazonS3',
      'Vary': 'Origin, Access-Control-Request-Headers, Access-Control-Request-Method',
      'x-amz-id-2': 'O9nG8yXMDHopDeY2tSadzPdvgARPq/lpUc5SuVyQauAI4Wjrva4/W2zQ49g/mZpLpPxMvSns24U=',
      'x-amz-request-id': '2CBBAE47CE0EEA70'
    }

    requests.push('put');

    xhr.respond(200, headers)
  })

  server.respondWith('POST', /.*\?uploadId.*$/, (xhr) => {
    requests.push('complete');
    xhr.respond(200, CONTENT_TYPE_XML, completeResponse(AWS_BUCKET, AWS_UPLOAD_KEY))
  })

  server.respondWith('GET', /.*\?uploadId.*$/, (xhr) => {
    requests.push('check for parts');
    var response = recheckForParts ? checkForPartsResponseSome(AWS_BUCKET, AWS_UPLOAD_KEY) : checkForPartsResponseNone(AWS_BUCKET, AWS_UPLOAD_KEY)
    recheckForParts = false
    xhr.respond(200, CONTENT_TYPE_XML, response)
  })

  server.respondWith('GET', /\/sign.*$/, (xhr) => {
    requests.push('sign');
    const payload = Array(29).join()
    xhr.respond(200, CONTENT_TYPE_TEXT, payload)
  })

  server.respondWith('DELETE', /.*\?uploadId.*$/, (xhr) => {
    requests.push('cancel');
    xhr.respond(204)
  })

  global.XMLHttpRequest = sinon.fakeServer.xhr
  global.setTimeout = (fc) => fc()
})

test.after(() => {
  server.restore()
})

test.cb('make requests in the correct order for the common case', (t) => {
  const evaporate = new Evaporate(baseConfig)

  const _handleUploadStart = sinon.spy()

  const _handleUploadComplete = (xhr, uploadKey) => {
    expect(_handleUploadStart).to.have.been.called
    expect(uploadKey).to.equal(AWS_UPLOAD_KEY)
    expect(requests.join(',')).to.eql('sign,initiate,sign,put,sign,complete')
    t.end()
  }

  const config = Object.assign({}, baseAddConfig, {
    started: _handleUploadStart,
    complete: _handleUploadComplete.bind(this)
  })

  evaporate.add(config)
})

test.cb('Cancel before initialize should do nothing', (t) => {
  const evaporate = new Evaporate(baseConfig)

  const _handleUploadStarted = (id) => {
    evaporate.cancel(id);
  }

  const _handleUploadCanceled = () => {
    expect(requests.join(',')).to.eql('')
    t.end()
  }

  const config = Object.assign({}, baseAddConfig, {
    started: _handleUploadStarted,
    cancelled: _handleUploadCanceled.bind(this)
  })

  evaporate.add(config)
})

test.cb('cancel in complete should execute cancel requests once', (t) => {
  const evaporate = new Evaporate(baseConfig)
  let uploadId

  const _handleUploadStarted = (id) => {
    uploadId = id;
  }

  const _handleUploadComplete = () => {
    evaporate.cancel(uploadId)
    expect(requests.join(',')).to.eql('sign,initiate,sign,put,sign,complete,sign,cancel,sign,check for parts')
    t.end()
  }

  const config = Object.assign({}, baseAddConfig, {
    started: _handleUploadStarted,
    complete: _handleUploadComplete.bind(this)
  })

  evaporate.add(config)
})

test.cb('cancel in complete should execute cancel requests twice', (t) => {
  const evaporate = new Evaporate(baseConfig)
  let uploadId

  recheckForParts = true

  const _handleUploadStarted = (id) => {
    uploadId = id;
  }

  const _handleUploadComplete = () => {
    evaporate.cancel(uploadId)
    expect(requests.join(',')).to.eql('sign,initiate,sign,put,sign,complete,sign,cancel,sign,check for parts,sign,cancel,sign,check for parts')
    t.end()
  }

  const config = Object.assign({}, baseAddConfig, {
    started: _handleUploadStarted,
    complete: _handleUploadComplete.bind(this)
  })

  evaporate.add(config)
})

test.skip('headObject works (1 call)', () => {
  // testing this requires access to FileReader, which isn't available...
})

test.skip('headObject works (2 calls)', () => {
  // testing this requires access to FileReader, which isn't available...
})

test.cb("resume() fetches parts again if no bytes loaded previously", (t) => {
  const evaporate = new Evaporate(baseConfig)
  let uploadId

  const _handleUploadStarted = (id) => {
    uploadId = id;
  }

  const _handleUploadComplete = () => {
    evaporate.pause(uploadId)
    evaporate.resume(uploadId)
    expect(requests.join(',')).to.eql('sign,initiate,sign,put,sign,complete,sign,get parts')
    t.end()
  }

  const config = Object.assign({}, baseAddConfig, {
    started: _handleUploadStarted,
    complete: _handleUploadComplete.bind(this)
  })

  evaporate.add(config)
})

test.skip("resume() uses internal state if file bytes were previously uploaded.", () => {
})

test.skip('resume() maintains correct uploaded file byte count', () => {
})
