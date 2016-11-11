import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

let server

function testS3Reuse(t, addConfig2, headEtag, evapConfig2) {
  addConfig2 = addConfig2 || {}
  t.context.headEtag = headEtag

  let evapConfig = {
    allowS3ExistenceOptimization: true,
    s3FileCacheHoursAgo: 24,
    computeContentMd5: true
  }

  // Upload the first time
  return testBase(t, {}, evapConfig)
      .then(function () {
        t.context.originalName = t.context.requestedAwsObjectKey
        addConfig2.name = randomAwsKey()
        // Upload the second time to trigger head
        evapConfig = Object.assign({}, evapConfig, evapConfig2 || {})
        t.context.requestedAwsObjectKey = addConfig2.name
        return testBase(t, addConfig2, evapConfig)
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

// S3 Object re-use
test('should re-use S3 object and callback complete', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')
      .then(function () {
        expect(t.context.config.complete.calledOnce).to.be.true
      })
})
test('should re-use S3 object with S3 requests correctly ordered', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,HEAD')
      })
})
test('should re-use S3 object calling cryptomd5 correctly', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')
      .then(function () {
        expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
      })
})
test('should re-use S3 object returning the S3 file upload ID', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')
      .then(function () {
        expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
      })
})
test('should re-use S3 object and callback complete with first param instance of xhr', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')
      .then(function () {
        expect(t.context.config.complete.firstCall.args[0]).to.be.instanceOf(sinon.FakeXMLHttpRequest)
      })
})
test('should re-use S3 object and callback complete with second param the reused awsKey', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')
      .then(function () {
        expect(t.context.config.complete.firstCall.args[1]).to.equal(t.context.originalName)
      })
})
test('should re-use S3 object and callback with the new object name', (t) => {
  return testS3Reuse(t, {nameChanged: sinon.spy()}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')
      .then(function () {
        expect(t.context.config.nameChanged.withArgs(t.context.originalName).calledOnce).to.be.true
      })
})

test('should not re-use S3 object if the first part\'s md5 digest do not match', (t) => {
  var cryptoMd5 = sinon.spy(function () { return 'md5Mismatch'; })

  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"', {cryptoMd5Method: cryptoMd5})
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test('should not re-use S3 object if the first part\'s md5 digest do not match calling cryptomd5 correctly', (t) => {
  var cryptoMd5 = sinon.spy(function () { return 'md5Mismatch'; })

  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"', {cryptoMd5Method: cryptoMd5})
      .then(function () {
        expect(cryptoMd5.calledTwice).to.be.true
      })
})
test('should not re-use S3 object if the first part\'s md5 digest do not match and callback complete with first param instance of xhr', (t) => {
  var cryptoMd5 = sinon.spy(function () { return 'md5Mismatch'; })
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"', {cryptoMd5Method: cryptoMd5})
      .then(function () {
        expect(t.context.config.complete.firstCall.args[0]).to.be.instanceOf(sinon.FakeXMLHttpRequest)
      })
})
test('should not re-use S3 object if the first part\'s md5 digest do not match and callback complete with second param the new awsKey', (t) => {
  var cryptoMd5 = sinon.spy(function () { return 'md5Mismatch'; })
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"', {cryptoMd5Method: cryptoMd5})
      .then(function () {
        expect(t.context.config.complete.firstCall.args[1]).to.equal(t.context.requestedAwsObjectKey)
      })
})
test('should not callback with a new object name if the first part\'s md5 digest do not match', (t) => {
  var cryptoMd5 = sinon.spy(function () { return 'md5Mismatch'; })

  return testS3Reuse(t, {nameChanged: sinon.spy()}, '"b2969107bdcfc6aa30892ee0867ebe79-1"', {cryptoMd5Method: cryptoMd5})
      .then(function () {
        expect(t.context.config.nameChanged.called).to.be.false
      })
})

test('should not re-use S3 object because the Etag does not match and callback complete', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892eeunmatched-1"')
      .then(function () {
        expect(t.context.config.complete.calledOnce).to.be.true
      })
})
test('should not re-use S3 object because the Etag does not match in the correct order', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892eeunmatched-1"')
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,' +
            'HEAD,' +
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test('should not re-use S3 object because the Etag does not match calling cryptomd5 correctly', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892eeunmatched-1"')
      .then(function () {
        expect(t.context.cryptoMd5.callCount).to.equal(4)
      })
})
test('should not re-use S3 object because the Etag does not match returning the S3 file upload ID', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892eeunmatched-1"')
      .then(function () {
        expect(t.context.completedAwsKey).to.not.equal(t.context.originalName)
      })
})
test('should not re-use S3 object because the Etag does not match callback complete with first param instance of xhr', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892eeunmatched-1"')
      .then(function () {
        expect(t.context.config.complete.firstCall.args[0]).to.be.instanceOf(sinon.FakeXMLHttpRequest)
      })
})
test('should not re-use S3 object because the Etag does not match callback complete with second param the new awsKey', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892eeunmatched-1"')
      .then(function () {
        expect(t.context.config.complete.firstCall.args[1]).to.equal(t.context.requestedAwsObjectKey)
      })
})


test('should not re-use S3 object if headObject returns 404', (t) => {
  t.context.headStatus = 404

  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,' +
            'HEAD,' +
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test('should not re-use S3 object if headObject returns 404 status correctly', (t) => {
  t.context.headStatus = 404

  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')
      .then(function () {
        expect(testRequests[t.context.testId][9].status).to.equal(404)
      })
})
test('should not re-use S3 object if headObject returns 404 callback complete with first param instance of xhr', (t) => {
  t.context.headStatus = 404
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892eeunmatched-1"')
      .then(function () {
        expect(t.context.config.complete.firstCall.args[0]).to.be.instanceOf(sinon.FakeXMLHttpRequest)
      })
})
test('should not re-use S3 object if headObject returns 404 callback complete with second param the new awsKey', (t) => {
  t.context.headStatus = 404
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892eeunmatched-1"')
      .then(function () {
        expect(t.context.config.complete.firstCall.args[1]).to.equal(t.context.requestedAwsObjectKey)
      })
})
test('should not callback with a new object name if headObject returns 404 status correctly', (t) => {
  t.context.headStatus = 404

  return testS3Reuse(t, {nameChanged: sinon.spy()}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')
      .then(function () {
        expect(t.context.config.nameChanged.called).to.be.false
      })
})

// headObject (xAmzHeadersCommon)
test('should set xAmzHeadersCommon when re-using S3 object', (t) => {
  const config = {
    xAmzHeadersCommon: { 'x-custom-header': 'head-reuse' }
  }
  return testS3Reuse(t, config)
      .then(function () {
        expect(headersForMethod(t, 'HEAD')['x-custom-header']).to.equal('head-reuse')
      })
})

// Retry
test('should not retry HEAD when trying to reuse S3 object and status is 404 with complete callback', (t) => {
  t.context.headStatus = 404

  return testS3Reuse(t)
      .then(function () {
        expect(t.context.config.complete.calledOnce).to.be.true
      })
})
test('should not retry HEAD when trying to reuse S3 object and status is 404 in the correct order', (t) => {
  t.context.headStatus = 404

  return testS3Reuse(t)
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,HEAD,' +
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test('should not retry HEAD when trying to reuse S3 object and status is 404 with a changed upload ID', (t) => {
  t.context.headStatus = 404

  return testS3Reuse(t)
      .then(function () {
        expect(t.context.completedAwsKey).to.not.equal(t.context.originalName)
      })
})

test('should retry HEAD twice when trying to reuse S3 object and status is non-404 error with complete callback', (t) => {
  t.context.headStatus = 403

  return testS3Reuse(t)
      .then(function () {
        expect(t.context.config.complete.calledOnce).to.be.true
      })
})
test('should retry HEAD twice when trying to reuse S3 object and status is non-404 error in the correct order', (t) => {
  t.context.headStatus = 403

  return testS3Reuse(t)
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,HEAD,HEAD,' +
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test('should retry HEAD twice when trying to reuse S3 object and status is non-404 error with a changed upload ID', (t) => {
  t.context.headStatus = 403

  return testS3Reuse(t)
      .then(function () {
        expect(t.context.completedAwsKey).to.not.equal(t.context.originalName)
      })
})
test('should retry HEAD twice when trying to reuse S3 object and status is non-404 error callback complete with first param instance of xhr', (t) => {
  t.context.headStatus = 403
  return testS3Reuse(t)
      .then(function () {
        expect(t.context.config.complete.firstCall.args[0]).to.be.instanceOf(sinon.FakeXMLHttpRequest)
      })
})
test('should retry HEAD twice when trying to reuse S3 object and status is non-404 error callback complete with second param the new awsKey', (t) => {
  t.context.headStatus = 403
  return testS3Reuse(t)
      .then(function () {
        expect(t.context.config.complete.firstCall.args[1]).to.equal(t.context.requestedAwsObjectKey)
      })
})
test('should not callback with a new object name if status is non-404 error with a changed upload ID', (t) => {
  t.context.headStatus = 403

  return testS3Reuse(t, {nameChanged: sinon.spy()})
      .then(function () {
        expect(t.context.config.nameChanged.called).to.be.false
      })
})
