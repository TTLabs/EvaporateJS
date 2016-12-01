import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

// constants

let server

function testCachedParts(t, addConfig, maxGetParts, partNumberMarker) {
  t.context.partNumberMarker = partNumberMarker
  t.context.maxGetParts = maxGetParts

  const evapConfig = {
    awsSignatureVersion: '2',
    s3FileCacheHoursAgo: 24
  }
  return testBase(t, addConfig, evapConfig)
      .then(function () {
        partNumberMarker = 0
        t.context.originalUploadObjectKey = t.context.requestedAwsObjectKey
        t.context.requestedAwsObjectKey = randomAwsKey()
        let reUpload = Object.assign({}, addConfig, {name: t.context.requestedAwsObjectKey});
        return evaporateAdd(t, t.context.evaporate, reUpload)
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

// Cached File Parts (some parts on S3), multipart upload not completed
test('should check for parts when re-uploading a cached file and not call cryptoMd5', (t) => {
  return testCachedParts(t, {}, 1, 0)
      .then(function () {
        expect(t.context.cryptoMd5.called).to.be.false
      })
})
test('should check for parts when re-uploading a cached file with S3 requests in the correct order', (t) => {

  return testCachedParts(t, {}, 1, 0)
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete,check for parts,PUT:partNumber=2,complete')
      })
})
test('should check for parts when re-uploading a cached file with S3 requests callback complete with first param instance of xhr', (t) => {
  return testCachedParts(t, {}, 1, 0)
      .then(function () {
        expect(t.context.config.complete.firstCall.args[0]).to.be.instanceOf(sinon.FakeXMLHttpRequest)
      })
})
test('should check for parts when re-uploading a cached file with S3 requests callback complete with second param the new awsKey', (t) => {
  return testCachedParts(t, {}, 1, 0)
      .then(function () {
        expect(t.context.config.complete.firstCall.args[1]).to.equal(t.context.originalUploadObjectKey)
      })
})
test('should check for parts when re-uploading a cached file and callback with the original object name', (t) => {

  return testCachedParts(t, {
        nameChanged: sinon.spy()
      }, 1, 0)
      .then(function () {
        expect(t.context.config.nameChanged.withArgs(t.context.originalUploadObjectKey).calledOnce).to.be.true
      })
})

test('should only upload remaining parts for an interrupted upload', (t) => {
  return testCachedParts(t, { file: new File({
    path: '/tmp/file',
    size: 29690176,
    name: randomAwsKey()
  })
  }, 3, 0)
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,PUT:partNumber=3,PUT:partNumber=4,PUT:partNumber=5,complete,' +
            'check for parts,check for parts,check for parts,' +
            'PUT:partNumber=4,PUT:partNumber=5,complete')
      })
})
test('should check for parts when re-uploading a cached file when getParts 404s and callback started', (t) => {
  t.context.getPartsStatus = 404

  return testCachedParts(t, {}, 1, 0)
      .then(function () {
        expect(t.context.config.started.calledOnce).to.be.true
      })
})
test('should check for parts when re-uploading a cached file when getParts 404s and not callback with new object name', (t) => {
  t.context.getPartsStatus = 404

  return testCachedParts(t, {
    nameChanged: sinon.spy()
  }, 1, 0)
      .then(function () {
        expect(t.context.config.nameChanged.called).to.be.false
      })
})
test('should check for parts when re-uploading a cached file when getParts 404s and not return the second name', (t) => {
  t.context.getPartsStatus = 404

  return testCachedParts(t, {}, 1, 0)
      .then(function () {
        expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
      })
})
test('should check for parts when re-uploading a cached file when getParts 404s and return the original name', (t) => {
  t.context.getPartsStatus = 404

  return testCachedParts(t, {}, 1, 0)
      .then(function () {
        expect(t.context.completedAwsKey).to.equal(t.context.originalUploadObjectKey)
      })
})
test('should check for parts when re-uploading a cached file when getParts 404s in the correct order', (t) => {
  t.context.getPartsStatus = 404
  return testCachedParts(t, {}, 1, 0)
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,' +
            'check for parts,' +
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test('should check for parts when re-uploading a cached file when getParts 404s with the correct status', (t) => {
  t.context.getPartsStatus = 404
  return testCachedParts(t, {}, 1, 0)
      .then(function () {
        expect(testRequests[t.context.testId][9].status).to.equal(404)
      })
})
test('should check for parts when re-uploading a cached file when getParts 404s callback complete with first param instance of xhr', (t) => {
  t.context.getPartsStatus = 404
  return testCachedParts(t, {}, 1, 0)
      .then(function () {
        expect(t.context.config.complete.firstCall.args[0]).to.be.instanceOf(sinon.FakeXMLHttpRequest)
      })
})
test('should check for parts when re-uploading a cached file when getParts 404s callback complete with second param the new awsKey', (t) => {
  t.context.getPartsStatus = 404
  return testCachedParts(t, {}, 1, 0)
      .then(function () {
        expect(t.context.config.complete.firstCall.args[1]).to.equal(t.context.originalUploadObjectKey)
      })
})

test('should check for parts when re-uploading a cached file, when getParts returns none and callback started', (t) => {
  return testCachedParts(t, { }, 0, 0)
      .then(function () {
        expect(t.context.config.started.calledOnce).to.be.true
      })
})
test('should check for parts when re-uploading a cached file, when getParts returns none and callback with partial name', (t) => {

  return testCachedParts(t, {
    nameChanged: sinon.spy()
  }, 0, 0)
      .then(function () {
        expect(t.context.config.nameChanged.withArgs(t.context.originalUploadObjectKey).calledOnce).to.be.true
      })
})
test('should check for parts when re-uploading a cached file, when getParts returns none in the correct order', (t) => {
  return testCachedParts(t, { }, 0, 0)
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,' +
            'check for parts,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test('should check for parts when re-uploading a cached file, when getParts returns none and return the second name', (t) => {
  return testCachedParts(t, { }, 0, 0)
      .then(function () {
        expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
      })
})
test('should check for parts when re-uploading a cached file, when getParts returns none and return the partial name', (t) => {
  return testCachedParts(t, { }, 0, 0)
      .then(function () {
        expect(t.context.completedAwsKey).to.equal(t.context.originalUploadObjectKey)
      })
})

test('should check for parts when re-uploading a cached file, when getParts is not truncated and callback started', (t) => {
  return testCachedParts(t, {
    file: new File({
      path: '/tmp/file',
      size: 50,
      name: randomAwsKey()
    })
  }, 1, 0)
      .then(function () {
        expect(t.context.config.started.calledOnce).to.be.true
      })
})
test('should check for parts when re-uploading a cached file, when getParts is not truncated in the correct order', (t) => {
  return testCachedParts(t, {
    file: new File({
      path: '/tmp/file',
      size: 50,
      name: randomAwsKey()
    })
  }, 1, 0)
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,complete,check for parts,complete')
      })
})
test('should check for parts when re-uploading a cached file, when getParts is not truncated and return the correct file upload ID', (t) => {
  return testCachedParts(t, {
    file: new File({
      path: '/tmp/file',
      size: 50,
      name: randomAwsKey()
    })
  }, 1, 0)
      .then(function () {
        expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
      })
})
test('should check for parts when re-uploading a cached file, when getParts is not truncated and return the partial name', (t) => {
  return testCachedParts(t, {
    file: new File({
      path: '/tmp/file',
      size: 50,
      name: randomAwsKey()
    })
  }, 1, 0)
      .then(function () {
        expect(t.context.completedAwsKey).to.equal(t.context.originalUploadObjectKey)
      })
})

test('should check for parts when re-uploading a cached file, when getParts is truncated and callback started', (t) => {
  const Parts5AddConfig = {
    name: t.context.requestedAwsObjectKey,
    file: new File({
      path: '/tmp/file',
      size: 29690176,
      name: randomAwsKey()
    })
  }

  let addConfig = Object.assign({}, Parts5AddConfig, {
    computeContentMd5: true,
    cryptoMd5Method: function (data) {
      return 'md5Checksum';
    }
  })

  return testCachedParts(t, addConfig, 5, 0)
      .then(function () {
        expect(t.context.config.started.calledOnce).to.be.true
      })
})
test('should check for parts when re-uploading a cached file, when getParts is truncated in the correct order', (t) => {
  const Parts5AddConfig = {
    name: t.context.requestedAwsObjectKey,
    file: new File({
      path: '/tmp/file',
      size: 29690176,
      name: randomAwsKey()
    })
  }

  let addConfig = Object.assign({}, Parts5AddConfig, {
    computeContentMd5: true,
    cryptoMd5Method: function (data) {
      return 'md5Checksum';
    }
  })

  return testCachedParts(t, addConfig, 5, 0)
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,PUT:partNumber=3,PUT:partNumber=4,PUT:partNumber=5,complete,' +
            'check for parts,check for parts,check for parts,check for parts,check for parts,complete')
      })
})
test('should check for parts when re-uploading a cached file, when getParts is truncated and not return the second name', (t) => {
  const Parts5AddConfig = {
    name: t.context.requestedAwsObjectKey,
    file: new File({
      path: '/tmp/file',
      size: 29690176,
      name: randomAwsKey()
    })
  }

  let addConfig = Object.assign({}, Parts5AddConfig, {
    computeContentMd5: true,
    cryptoMd5Method: function (data) {
      return 'md5Checksum';
    }
  })

  return testCachedParts(t, addConfig, 5, 0)
      .then(function () {
        expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
      })
})
test('should check for parts when re-uploading a cached file, when getParts is truncated and return the partial name', (t) => {
  const Parts5AddConfig = {
    name: t.context.requestedAwsObjectKey,
    file: new File({
      path: '/tmp/file',
      size: 29690176,
      name: randomAwsKey()
    })
  }

  let addConfig = Object.assign({}, Parts5AddConfig, {
    computeContentMd5: true,
    cryptoMd5Method: function (data) {
      return 'md5Checksum';
    }
  })

  return testCachedParts(t, addConfig, 5, 0)
      .then(function () {
        expect(t.context.completedAwsKey).to.equal(t.context.originalUploadObjectKey)
      })
})

// Retry on error
test('should not retry check for remaining uploaded parts if status is 404', (t) => {
  t.context.getPartsStatus = 404
  return testCachedParts(t, {})
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,' +
            'check for parts,' +
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test('should retry check for parts twice if status is non-404 error', (t) => {
  t.context.getPartsStatus = 403
  return testCachedParts(t, {})
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,' +
            'check for parts,check for parts,' +
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test('should not callback with new object name if status is non-404 error', (t) => {
  t.context.getPartsStatus = 403

  return testCachedParts(t, {
    nameChanged: sinon.spy()
  })
      .then(function () {
        expect(t.context.config.nameChanged.called).to.be.false
      })
})
test('should not retry check for remaining uploaded parts if status is 404 callback complete with first param instance of xhr', (t) => {
  t.context.getPartsStatus = 403
  return testCachedParts(t)
      .then(function () {
        expect(t.context.config.complete.firstCall.args[0]).to.be.instanceOf(sinon.FakeXMLHttpRequest)
      })
})
test('should not retry check for remaining uploaded parts if status is 404 callback complete with second param the new awsKey', (t) => {
  t.context.getPartsStatus = 403
  return testCachedParts(t)
      .then(function () {
        expect(t.context.config.complete.firstCall.args[1]).to.equal(t.context.originalUploadObjectKey)
      })
})

// getParts (xAmzHeadersCommon)
test('should set xAmzHeadersCommon when re-uploading a cached file', (t) => {
  return testCachedParts(t, {
    xAmzHeadersCommon: { 'x-custom-header': 'reused' }
  }, 0, 0)
      .then(function () {
        expect(headersForMethod(t, 'GET', /.*\?uploadId.*$/)['x-custom-header']).to.equal('reused')
      })
})
