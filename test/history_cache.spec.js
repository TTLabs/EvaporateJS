import chai, { expect } from 'chai'
import chaiSinon from 'sinon-chai'
import test from 'ava'

import Evaporate from '../evaporate'

chai.use(chaiSinon)

// consts

const AWS_BUCKET = 'bucket'

const baseConfig = {
  signerUrl: 'http://what.ever/sign',
  aws_key: 'testkey',
  bucket: AWS_BUCKET,
  logging: false
}

let cache

test.beforeEach(() => {
  cache = new Evaporate(baseConfig).historyCache
})

test('should work', () => {
  expect(true).to.be.ok
})

test('should set and get an item', () => {
  cache.setItem('apples', 'oranges');
  expect(cache.getItem('apples')).to.eql('oranges')
})

test('should remove an item', () => {
  cache.setItem('apples', 'oranges');
  expect(cache.getItem('apples')).to.eql('oranges')
  cache.removeItem('apples')
  expect(cache.getItem('apples')).to.eql(undefined)
})
