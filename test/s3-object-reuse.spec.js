import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

let server

function testS3Reuse(t, addConfig2, headEtag, evapConfig2) {
  t.context.headEtag = headEtag

  let evapConfig = {
    allowS3ExistenceOptimization: true,
    s3FileCacheHoursAgo: 24,
    computeContentMd5: true
  }

  // Upload the first time
  return testBase(t, {}, evapConfig)
      .then(function () {
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
test.serial('should re-use S3 object and callback complete', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')
      .then(function () {
        expect(t.context.config.complete.callCount).to.equal(1)
      })
})
test.serial('should re-use S3 object with S3 requests correctly ordered', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,HEAD')
      })
})
test.serial('should re-use S3 object calling cryptomd5 correctly', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')
      .then(function () {
        expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
      })
})
test.serial('should re-use S3 object returning the S3 file upload ID', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')
      .then(function () {
        expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
      })
})

test.serial('should not re-use S3 object if the first part\'s md5 digest do not match', (t) => {
  var cryptoMd5 = sinon.spy(function () { return 'md5Mismatch'; })

  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"', {cryptoMd5Method: cryptoMd5})
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test.serial('should not re-use S3 object if the first part\'s md5 digest do not match calling cryptomd5 correctly', (t) => {
  var cryptoMd5 = sinon.spy(function () { return 'md5Mismatch'; })

  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"', {cryptoMd5Method: cryptoMd5})
      .then(function () {
        expect(cryptoMd5.callCount).to.equal(2)
      })
})

test.serial('should not re-use S3 object because the Etag does not match and callback complete', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892eeunmatched-1"')
      .then(function () {
        expect(t.context.config.complete.callCount).to.equal(1)
      })
})
test.serial('should not re-use S3 object because the Etag does not match in the correct order', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892eeunmatched-1"')
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,' +
            'HEAD,' +
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test.serial('should not re-use S3 object because the Etag does not match calling cryptomd5 correctly', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892eeunmatched-1"')
      .then(function () {
        expect(t.context.cryptoMd5.callCount).to.equal(4)
      })
})
test.serial('should not re-use S3 object because the Etag does not match returning the S3 file upload ID', (t) => {
  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892eeunmatched-1"')
      .then(function () {
        expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
      })
})
test.serial('should not re-use S3 object if headObject returns 404', (t) => {
  t.context.headStatus = 404

  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,' +
            'HEAD,' +
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test.serial('should not re-use S3 object if headObject returns 404 status correctly', (t) => {
  t.context.headStatus = 404

  return testS3Reuse(t, {}, '"b2969107bdcfc6aa30892ee0867ebe79-1"')
      .then(function () {
        expect(testRequests[t.context.testId][9].status).to.equal(404)
      })
})

// headObject (xAmzHeadersCommon)
test.serial('should set xAmzHeadersCommon when re-using S3 object', (t) => {
  const config = {
    xAmzHeadersCommon: { 'x-custom-header': 'head-reuse' }
  }
  return testS3Reuse(t, config)
      .then(function () {
        expect(headersForMethod(t, 'HEAD')['x-custom-header']).to.equal('head-reuse')
      })
})

// Retry
test.serial('should not retry HEAD when trying to reuse S3 object and status is 404 with complete callback', (t) => {
  t.context.headStatus = 404

  return testS3Reuse(t, {})
      .then(function () {
        expect(t.context.config.complete.callCount).to.equal(1)
      })
})
test.serial('should not retry HEAD when trying to reuse S3 object and status is 404 in the correct order', (t) => {
  t.context.headStatus = 404

  return testS3Reuse(t, {})
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,HEAD,' +
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test.serial('should not retry HEAD when trying to reuse S3 object and status is 404 with a changed upload ID', (t) => {
  t.context.headStatus = 404

  return testS3Reuse(t, {})
      .then(function () {
        expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
      })
})


test.serial('should retry HEAD twice when trying to reuse S3 object and status is non-404 error with complete callback', (t) => {
  t.context.headStatus = 403

  return testS3Reuse(t, {})
      .then(function () {
        expect(t.context.config.complete.callCount).to.equal(1)
      })
})
test.serial('should retry HEAD twice when trying to reuse S3 object and status is non-404 error in the correct order', (t) => {
  t.context.headStatus = 403

  return testS3Reuse(t, {})
      .then(function () {
        expect(requestOrder(t)).to.equal(
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete,HEAD,HEAD,' +
            'initiate,PUT:partNumber=1,PUT:partNumber=2,complete')
      })
})
test.serial('should retry HEAD twice when trying to reuse S3 object and status is non-404 error with a changed upload ID', (t) => {
  t.context.headStatus = 403

  return testS3Reuse(t, {})
      .then(function () {
        expect(t.context.completedAwsKey).to.not.equal(t.context.requestedAwsObjectKey)
      })
})
