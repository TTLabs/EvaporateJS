import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

// constants

let server

if (!global.DOMException) {
	global.DOMException = function() {
		this.error = undefined
	}
}
function testCommon(t, addConfig, initConfig) {
  let evapConfig = Object.assign({}, {awsSignatureVersion: '2'}, initConfig)
  return testBase(t, addConfig, evapConfig)
}
function testMd5V2(t) {
  return testCommon(t, {}, { awsSignatureVersion: '2', computeContentMd5: true })
}

function testMd5V4(t) {
  return testCommon(t, {}, {
    computeContentMd5: true,
    cryptoHexEncodedHash256: function (d) { return d; }
  })
}

function testSignerErrors(t, errorStatus, evapConfig) {
  t.context.retry = function (type) {
    return type === 'sign'
  }
  t.context.errorStatus = errorStatus

  function requestOrder() {
    let request_order = [],
        requestMap = {
          'GET:to_sign': 'sign',
          'POST:uploads': 'initiate',
          'POST:uploadId': 'complete',
          'DELETE:uploadId': 'cancel',
          'GET:uploadId': 'check for parts'
        },
        requests = testRequests[t.context.testId] || []
    requests.forEach(function (r) {
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

  return testCommon(t, { file: new File({
    path: '/tmp/file',
    size: 50,
    name: 'tests'
  })}, evapConfig)
      .then(function () {
        return Promise.resolve(requestOrder(t));
      })
      .catch(function (reason) {
        return Promise.reject(reason + " " + requestOrder(t));
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
test('should not call cryptoMd5 upload a file with defaults and V2 signature', (t) => {
  return testCommon(t, {}, { awsSignatureVersion: '2' })
      .then(function () {
        expect(t.context.cryptoMd5.callCount).to.equal(0)
      })
})
test('should upload a file with S3 requests in the correct order', (t) => {
  return testCommon(t)
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test('should upload a file and return the correct file upload ID', (t) => {
  return testCommon(t)
      .then(function () {
        expect(t.context.completedAwsKey).to.equal(t.context.requestedAwsObjectKey)
      })
})
test('should upload a file and callback complete once', (t) => {
  return testCommon(t)
      .then(function () {
        expect(t.context.config.complete.calledOnce).to.be.true
      })
})
test('should upload a file and callback complete with first param instance of xhr', (t) => {
  return testCommon(t)
      .then(function () {
        expect(t.context.config.complete.firstCall.args[0]).to.be.instanceOf(sinon.FakeXMLHttpRequest)
      })
})
test('should upload a file and callback complete with second param the awsKey', (t) => {
  return testCommon(t)
      .then(function () {
        expect(t.context.config.complete.firstCall.args[1]).to.equal(t.context.requestedAwsObjectKey)
      })
})
test('should upload a file and not callback with a changed object name', (t) => {
  return testCommon(t, {nameChanged: sinon.spy()})
      .then(function () {
        expect(t.context.config.nameChanged.callCount).to.equal(0)
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
  return testCommon(t, {
    xAmzHeadersAtInitiate: { 'x-custom-header': 'peanuts' }
  })
      .then(function () {
        expect(headersForMethod(t, 'POST', /^.*\?uploads.*$/)['x-custom-header']).to.equal('peanuts')
      })
})
test('should pass xAmzHeadersAtUpload headers', (t) => {
  return testCommon(t, {
    xAmzHeadersAtUpload: { 'x-custom-header': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'PUT')['x-custom-header']).to.equal('phooey')
      })
})
test('should pass xAmzHeadersAtComplete headers', (t) => {
  return testCommon(t, {
    xAmzHeadersAtComplete: { 'x-custom-header': 'eindelijk' }
  })
      .then(function () {
        expect(headersForMethod(t, 'POST', /.*\?uploadId.*$/)['x-custom-header']).to.equal('eindelijk')
      })
})

test('should not use xAmzHeadersCommon headers for Initiate', (t) => {
  return testCommon(t, {
    xAmzHeadersAtInitiate: { 'x-custom-header': 'peanuts' },
    xAmzHeadersCommon: { 'x-custom-header': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'POST', /^.*\?uploads.*$/)['x-custom-header']).to.equal('peanuts')
      })
})
test('should use xAmzHeadersCommon headers for Parts', (t) => {
  return testCommon(t, {
    xAmzHeadersCommon: { 'x-custom-header': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'PUT')['x-custom-header']).to.equal('phooey')
      })
})
test('should use xAmzHeadersCommon headers for Complete', (t) => {
  return testCommon(t, {
    xAmzHeadersCommon: { 'x-custom-header': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'POST', /.*\?uploadId.*$/)['x-custom-header']).to.equal('phooey')
      })
})

test('should let xAmzHeadersCommon override xAmzHeadersAtUpload (1)', (t) => {
  return testCommon(t, {
    xAmzHeadersAtUpload: { 'x-custom-header1': 'phooey' },
    xAmzHeadersCommon: { 'x-custom-header3': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'PUT')['x-custom-header3']).to.equal('phooey')
      })
})
test('should let xAmzHeadersCommon override xAmzHeadersAtUpload (2)', (t) => {
  return testCommon(t, {
    xAmzHeadersAtUpload: { 'x-custom-header1': 'phooey' },
    xAmzHeadersCommon: { 'x-custom-header3': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'PUT')['x-custom-header1']).to.equal(undefined)
      })
})
test('should let xAmzHeadersCommon override xAmzHeadersAtComplete (1)', (t) => {
  return testCommon(t, {
    xAmzHeadersAtComplete: { 'x-custom-header2': 'phooey' },
    xAmzHeadersCommon: { 'x-custom-header3': 'phooey' }
  })
      .then(function () {
        expect(headersForMethod(t, 'POST', /.*\?uploadId.*$/)['x-custom-header3']).to.equal('phooey')
      })
})
test('should let xAmzHeadersCommon override xAmzHeadersAtComplete (2)', (t) => {
  return testCommon(t, {
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

  return testCommon(t, {})
      .then(function () {
        expect(['initiate,initiate,PUT:partNumber=1,PUT:partNumber=2,complete',
          'initiate,initiate,PUT:partNumber=2,PUT:partNumber=1,complete']).to.include('initiate,initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})

test('should retry Complete', (t) => {
  t.context.retry = function (type) {
    return type === 'complete'
  }

  return testCommon(t, {})
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete,complete')
      })
})

test('should retry Upload Part', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }

  return testCommon(t, { file: new File({
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
test('should retry get signature for common case: Initiate, Put, Complete (authorization), for non-permission responses', (t) => {
  return testSignerErrors(t, 500)
      .then(function (result) {
        expect(result).to.equal('sign,sign,initiate,sign,sign,PUT:partNumber=1,sign,sign,complete')
      })
})
test('should not retry get signature for common case: Initiate, Put, Complete (authorization), for permission 401', (t) => {
  return testSignerErrors(t, 401)
      .then(function (result) {
        t.fail('Expected test to fail but received: ' + result)
      })
      .catch(function (reason) {
        expect(reason).to.equal('Permission denied status:401 sign')
      })
})
test('should not retry get signature for common case: Initiate, Put, Complete (authorization), for permission 403', (t) => {
  return testSignerErrors(t, 403)
      .then(function (result) {
        t.fail('Expected test to fail but received: ' + result)
      })
      .catch(function (reason) {
        expect(reason).to.equal('Permission denied status:403 sign')
      })
})
test('should not retry customAuthMethod for common case: Initiate, Put, Complete (authorization) if it rejects', (t) => {
  const customRejectingAuthHandler = function  () {
    return Promise.reject('Permission denied');
  }
  return testSignerErrors(t, 403, {signerUrl: undefined, customAuthMethod: customRejectingAuthHandler})
      .then(function (result) {
        t.fail('Expected test to fail but received: ' + result)
      })
      .catch(function (reason) {
        expect(reason).to.equal('Permission denied ')
      })
})


// Failures to upload because PUT Part 404
test('should fail if PUT part 404s', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }
  t.context.errorStatus = 404

  return testCommon(t)
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

  return testCommon(t, { cancelled: sinon.spy() })
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

  return testCommon(t)
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

  return testCommon(t, { cancelled: sinon.spy() })
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

  return testCommon(t, { cancelled: sinon.spy() })
      .then(function () {
        t.fail('Expected upload to fail but it did not.')
      })
      .catch(function () {
        expect(requestOrder(t)).to.match(/initiate,PUT:partNumber=1,cancel,cancel/)
      })
})

// Failure on FileReader read error is propagated
test.serial('should propagate error when FileReader api fails', (t) => {
	var arrayBuffer = global['FileReader'].prototype.readAsArrayBuffer;

	global.FileReader.prototype.readAsArrayBuffer = function(blob)
	{
		this.error = new DOMException();
		this.onloadend();
	};

	const config = {
		name: randomAwsKey(),
		file: new File({
			path: '/tmp/file',
			size: 8,
			name: randomAwsKey()
		}),
		computeContentMd5: true,
		cryptoMd5Method: function () { return 'MD5Value'; },
	}

	return testCommon(t, config, config)
		.then(
			function (result) {
				global['FileReader'].prototype.readAsArrayBuffer = arrayBuffer
				t.fail('Expected upload to fail but it did not.')
			},
			function (reason) {
				global['FileReader'].prototype.readAsArrayBuffer = arrayBuffer
				expect(reason).to.match(/aborted/i)
			})
})