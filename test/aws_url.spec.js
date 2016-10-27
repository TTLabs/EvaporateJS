import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

// consts

let server
// test that AWS Url obeys the contract

function testAwsUrl(t, input) {
  return new Promise(function (resolve) {
    testBase(t, {}, input)
        .then(function () {
          resolve(testRequests[t.context.testId][1].url)
        })

  })
}

test.before(() => {
  sinon.xhr.supportsCORS = true
  server = serverCommonCase()

  global.XMLHttpRequest = sinon.fakeServer.xhr
})

test.beforeEach((t) => {
  let testId = 'aws_url/' + t.title
  if (testId in testContext) {
    console.error('Test case must be uniquely named:', t.title)
    return
  }

  t.context.testId = testId
  t.context.requestedAwsObjectKey = randomAwsKey()
  t.context.requests = []

  t.context.attempts = 0
  t.context.maxRetries = 1
  t.context.retry = function (type) {}

  t.context.baseAddConfig = {
    name: t.context.requestedAwsObjectKey,
    file: new File({
      path: '/tmp/file',
      size: 50,
      name: randomAwsKey()
    }),
    xAmzHeadersAtInitiate: {testId: testId},
    xAmzHeadersCommon: { testId: testId },
    maxRetryBackoffSecs: 0.1,
    abortCompletionThrottlingMs: 0
  }

  t.context.cryptoMd5 = sinon.spy(function () { return 'md5Checksum'; })

  testContext[testId] = t.context
})

// cloudfront, aws_url, awsRegion and s3Acceleration

test('should respect awsRegion and cloudfront when not defined', (t) => {
  return testAwsUrl(t)
      .then(function (url) {
        expect(url).to.match(new RegExp('https://s3.amazonaws.com/bucket/'))
      })
})

test('should respect awsRegion and cloudfront when false', (t) => {
  return testAwsUrl(t, { cloudfront: false })
      .then(function (url) {
        expect(url).to.match(new RegExp('https://s3.amazonaws.com/bucket/'))
      })
})

test('should respect awsRegion and cloudfront when true', (t) => {
  return testAwsUrl(t, { cloudfront: true })
      .then(function (url) {
        expect(url).to.match(new RegExp('https://bucket.s3.amazonaws.com'))
      })
})

// awsRegions

test('should respect awsRegion not us-east-1', (t) => {
  return testAwsUrl(t, { awsRegion: 'eu-central-1' })
      .then(function (url) {
        expect(url).to.match(new RegExp('https://s3-eu-central-1.amazonaws.com/bucket/'))
      })
})

test('should respect awsRegion not us-east-1 with cloudfront', (t) => {
  return testAwsUrl(t, { awsRegion: 'eu-central-1', cloudfront: true })
      .then(function (url) {
        expect(url).to.match(new RegExp('https://bucket.s3-eu-central-1.amazonaws.com/'))
      })
})

// aws_url
test('should respect aws_url if presented without cloudfront', (t) => {
  return testAwsUrl(t, { awsRegion: 'eu-central-1', aws_url: 'https://s3.dualstack.us-east-1.amazonaws.com' })
      .then(function (url) {
        expect(url).to.match(new RegExp('https://s3.dualstack.us-east-1.amazonaws.com/bucket/'))
      })
})

test('should respect aws_url if presented with cloudfront', (t) => {
  return testAwsUrl(t, { awsRegion: 'eu-central-1', aws_url: 'https://s3.dualstack.us-east-1.amazonaws.com', cloudfront: true })
      .then(function (url) {
        expect(url).to.match(new RegExp('https://s3.dualstack.us-east-1.amazonaws.com'))
      })
})

// S3 Transfer Acceleration

test('should respect s3Acceleration with defaults', (t) => {
  testAwsUrl(t, { s3Acceleration: true })
      .then(function (url) {
        expect(url).to.match(new RegExp('https://bucket.s3-accelerate.amazonaws.com/'))
    })
})

test('should respect s3Acceleration with region outside of us-east-1', (t) => {
  testAwsUrl(t, { s3Acceleration: true, awsRegion: 'eu-central-1' })
      .then(function (url) {
        expect(url).to.match(new RegExp('https://bucket.s3-accelerate.amazonaws.com/'))
      })
})
