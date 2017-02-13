import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

// consts

let server

// test that AWS Key obeys the contract
function testAwsKey(t, input, addC) {
  return new Promise(function (resolve) {
    let evapConfig = Object.assign({}, {awsSignatureVersion: '2'}, input)
    testBase(t, addC || {}, evapConfig)
        .then(function () {
          resolve(testRequests[t.context.testId][1].requestHeaders.Authorization)
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

// aws_key
test.only('should allow the aws_key to be overridden on add', (t) => {
  return testAwsKey(t, {}, { configOverrides: { aws_key: 'notRandomAwsKey'} })
      .then(function (key) {
        expect(key).to.include('notRandomAwsKey')
      })
})
