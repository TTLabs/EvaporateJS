import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

// consts

let server
// test that AWS Configuration obeys the contract

function testAwsConfig(t, input, addC) {
  return new Promise(function (resolve) {
    let evapConfig = Object.assign({}, {awsSignatureVersion: '2'}, input)
    testBase(t, addC || {}, evapConfig)
        .then(function () {
          resolve(testRequests[t.context.testId][1])
        })

  })
}

test.before(() => {
  sinon.xhr.supportsCORS = true
  server = serverCommonCase()

  global.XMLHttpRequest = sinon.fakeServer.xhr
})

test.beforeEach((t) => {
  beforeEachSetup(t, new File({
    path: '/tmp/file',
    size: 50,
    name: randomAwsKey()
  }))
})

// cloudfront, aws_url, awsRegion and s3Acceleration

test('should respect awsRegion and cloudfront when not defined', (t) => {
  return testAwsConfig(t)
      .then(function (config) {
        expect(config.url).to.match(new RegExp('https://s3.amazonaws.com/bucket/'))
      })
})

test('should respect awsRegion and cloudfront when false', (t) => {
  return testAwsConfig(t, { cloudfront: false })
      .then(function (config) {
        expect(config.url).to.match(new RegExp('https://s3.amazonaws.com/bucket/'))
      })
})

test('should respect awsRegion and cloudfront when true', (t) => {
  return testAwsConfig(t, { cloudfront: true })
      .then(function (config) {
        expect(config.url).to.match(new RegExp('https://bucket.s3.amazonaws.com'))
      })
})

test('should allow the aws_url to be overriddden on add', (t) => {
  return testAwsConfig(t, { awsRegion: 'eu-central-1', aws_url: 'https://s3.dualstack.us-east-1.amazonaws.com', cloudfront: true },
      { configOverrides: { aws_url: 'https://s3.dualstack.us-east-3.amazonaws.com'} })
      .then(function (config) {
        expect(config.url).to.match(new RegExp('https://s3.dualstack.us-east-3.amazonaws.com'))
      })
})

// awsRegions

test('should respect awsRegion not us-east-1', (t) => {
  return testAwsConfig(t, { awsRegion: 'eu-central-1' })
      .then(function (config) {
        expect(config.url).to.match(new RegExp('https://s3-eu-central-1.amazonaws.com/bucket/'))
      })
})

test('should respect awsRegion not us-east-1 with cloudfront', (t) => {
  return testAwsConfig(t, { awsRegion: 'eu-central-1', cloudfront: true })
      .then(function (config) {
        expect(config.url).to.match(new RegExp('https://bucket.s3-eu-central-1.amazonaws.com/'))
      })
})

// aws_url
test('should respect aws_url if presented without cloudfront', (t) => {
  return testAwsConfig(t, { awsRegion: 'eu-central-1', aws_url: 'https://s3.dualstack.us-east-1.amazonaws.com' })
      .then(function (config) {
        expect(config.url).to.match(new RegExp('https://s3.dualstack.us-east-1.amazonaws.com/bucket/'))
      })
})

test('should respect aws_url if presented with cloudfront', (t) => {
  return testAwsConfig(t, { awsRegion: 'eu-central-1', aws_url: 'https://s3.dualstack.us-east-1.amazonaws.com', cloudfront: true })
      .then(function (config) {
        expect(config.url).to.match(new RegExp('https://s3.dualstack.us-east-1.amazonaws.com'))
      })
})

// S3 Transfer Acceleration

test('should respect s3Acceleration with defaults', (t) => {
  return testAwsConfig(t, { s3Acceleration: true })
      .then(function (config) {
        expect(config.url).to.match(new RegExp('https://bucket.s3-accelerate.amazonaws.com/'))
    })
})

test('should respect s3Acceleration with region outside of us-east-1', (t) => {
  return testAwsConfig(t, { s3Acceleration: true, awsRegion: 'eu-central-1' })
      .then(function (config) {
        expect(config.url).to.match(new RegExp('https://bucket.s3-accelerate.amazonaws.com/'))
      })
})

// aws_key
test('should allow the aws_key to be overridden on add', (t) => {
  return testAwsConfig(t, {}, { configOverrides: { aws_key: 'notRandomAwsKey'} })
      .then(function (config) {
        expect(config.requestHeaders.Authorization).to.include('notRandomAwsKey')
      })
})
