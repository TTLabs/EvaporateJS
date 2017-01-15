import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

let server;

const signResponseHandler = function  (r) {
  return new Promise(function (resolve) {
    resolve('1234567890123456789012345srh');
  });
}

const customAuthHandler = function  () {
  return Promise.resolve('123456789012345678901234cstm');
}

function testCommonAuthorization(t, addCfg, evapConfig) {
  const addConfig = Object.assign({}, t.context.baseAddConfig, addCfg, {
    error: function (msg) {
      t.context.errMessages.push(msg);
    }})

  evapConfig = Object.assign({ s3FileCacheHoursAgo: 24 }, evapConfig)
  return testBase(t, addConfig, evapConfig);
}

function v2Authorization(signature) {
  return 'AWS testkey:' + signature
}
function testV2Authorization(t, initConfig, addCfg) {
  const config = {awsSignatureVersion: '2', signerUrl: 'http://what.ever/signv2'}
  const evapConfig = Object.assign({}, config, initConfig)

  return testCommonAuthorization(t, addCfg, evapConfig);
}
function testV2ToSign(t, request, amzHeaders, addConfig, evapConfig) {
  return testV2Authorization(t, evapConfig, addConfig)
      .then(function () {
        var qp = params(testRequests[t.context.testId][2].url),
            h = Object.assign({}, amzHeaders, {testId: t.context.testId, 'x-amz-date': qp.datetime}),
            r = Object.assign({}, request, {x_amz_headers: h}),
            expected = encodeURIComponent(stringToSignV2('/' + AWS_BUCKET + '/' + t.context.config.name +
                '?partNumber=1&uploadId=Hzr2sK034dOrV4gMsYK.MMrtWIS8JVBPKgeQ.LWd6H8V2PsLecsBqoA1cG1hjD3G4KRX_EBEwxWWDu8lNKezeA--', 'PUT', r))

        return new Promise(function (resolve, reject) {
          var result = {
            result: qp.to_sign,
            expected: expected
          }
          resolve(result)

        })
      })

}
function testV2ListParts(t, request, amzHeaders, addConfig, maxGetParts, partNumberMarker, evapConfig) {
  t.context.partNumberMarker = partNumberMarker
  t.context.maxGetParts = maxGetParts

  addConfig = Object.assign({}, {file: new File({
        path: '/tmp/file',
        size: 29690176,
        name: 'tests'
      })}, addConfig)
  return testV2Authorization(t, evapConfig, addConfig)
      .then(function () {
        partNumberMarker = 0
        t.context.originalUploadObjectKey = t.context.requestedAwsObjectKey
        t.context.requestedAwsObjectKey = randomAwsKey()
        let reUpload = Object.assign({}, addConfig, {name: t.context.requestedAwsObjectKey});
        return evaporateAdd(t, t.context.evaporate, reUpload)
      })
      .then(function () {
        var qp = params(testRequests[t.context.testId][18].url),
            h = Object.assign({}, amzHeaders, {testId: t.context.testId, 'x-amz-date': qp.datetime}),
            r = Object.assign({}, request, {x_amz_headers: h}),
            expected = encodeURIComponent(stringToSignV2('/' + AWS_BUCKET + '/' + t.context.originalUploadObjectKey +
                '?uploadId=Hzr2sK034dOrV4gMsYK.MMrtWIS8JVBPKgeQ.LWd6H8V2PsLecsBqoA1cG1hjD3G4KRX_EBEwxWWDu8lNKezeA--', 'GET', r))

        return new Promise(function (resolve) {
          var result = {
            result: qp.to_sign,
            expected: expected
          }
          resolve(result)

        })
      })
}
function testV4ListParts(t, addConfig, maxGetParts, partNumberMarker, evapConfig) {
  t.context.partNumberMarker = partNumberMarker
  t.context.maxGetParts = maxGetParts

  addConfig = Object.assign({}, {file: new File({
    path: '/tmp/file',
    size: 29690176,
    name: 'tests'
  })}, addConfig)
  return testV4Authorization(t, evapConfig, addConfig)
      .then(function () {
        partNumberMarker = 0
        t.context.originalUploadObjectKey = t.context.requestedAwsObjectKey
        t.context.requestedAwsObjectKey = randomAwsKey()
        let reUpload = Object.assign({}, addConfig, {name: t.context.requestedAwsObjectKey});
        return evaporateAdd(t, t.context.evaporate, reUpload)
      })
      .then(function () {
        return new Promise(function (resolve) {
          var qp = params(testRequests[t.context.testId][18].url)

          var result =  {
            result: qp.to_sign,
            datetime: qp.datetime
          }

          resolve(result)
        })
      })
}

function stringToSignV2(path, method, request) {

  var x_amz_headers = '', result, header_key_array = [];

  for (var key in request.x_amz_headers) {
    if (request.x_amz_headers.hasOwnProperty(key)) {
      header_key_array.push(key);
    }
  }
  header_key_array.sort();

  header_key_array.forEach(function (header_key) {
    x_amz_headers += (header_key + ':' + request.x_amz_headers[header_key] + '\n');
  });

  result = method + '\n' +
      (request.md5_digest || '') + '\n' +
      (request.contentType || '') + '\n' +
      '\n' +
      x_amz_headers +
      '' +
      path;

  return result;
}

function v4Authorization(signingKey) {
  return 'AWS4-HMAC-SHA256 Credential=testkey/' + v4DateString() + '/us-east-1/s3/aws4_request, SignedHeaders=host;testid;x-amz-date, Signature=' + signingKey
}
function v4DateString() {
  return new Date().toISOString().slice(0, 10).replace(/-|:/g, '')
}
function testV4Authorization(t, initConfig, addCfg) {
  const config = {
    signerUrl: 'http://what.ever/signv4',
    awsSignatureVersion: '4',
    computeContentMd5: true,
    cryptoMd5Method: function () { return 'MD5Value'; },
    cryptoHexEncodedHash256: function (data) { return data; }
  }
  const evapConfig = Object.assign({}, config, initConfig)

  return testCommonAuthorization(t, addCfg, evapConfig);
}
function testV4ToSign(t, addConfig) {
  return testV4Authorization(t, {cryptoHexEncodedHash256: function (d) { return d; }}, addConfig)
      .then(function () {
        return new Promise(function (resolve) {
          var qp = params(testRequests[t.context.testId][2].url)

          var result =  {
            result: qp.to_sign,
            datetime: qp.datetime
          }

          resolve(result)
        })
      })
}

function params(url) {
  var query = url.split("?"),
      qs = query[1] || '',
      pairs = qs.split("&"),
      result = {};
  pairs.forEach(function (r) {
    var pr = r.split("=");
    if (pr.length === 1) {
      result[pr[0]] = null;
    } else {
      result[pr[0]] = pr[1];
    }
  });
  return result;
}

test.before(() => {
  sinon.xhr.supportsCORS = true

  global.XMLHttpRequest = sinon.useFakeXMLHttpRequest()

  global.window = {
   localStorage: {}
  };

  server = serverCommonCase()
})

test.beforeEach((t) =>{
  beforeEachSetup(t, new File({
      path: '/tmp/file',
      size: 50,
      name: 'tests'
    })
  )

  delete t.context.cryptoMd5
  delete t.context.cryptoHexEncodedHash256

})

test('should correctly create V2 string to sign for PUT', (t) => {
  return testV2ToSign(t)
      .then(function (result) {
        expect(result.result).to.equal(result.expected)
      })
})
test('should correctly create V2 string to sign for PUT with amzHeaders', (t) => {
  return testV2ToSign(t, {}, { 'x-custom-header': 'peanuts' }, {xAmzHeadersCommon: { testId: t.context.testId, 'x-custom-header': 'peanuts' }})
      .then(function (result) {
        expect(result.result).to.equal(result.expected);
      })
})
test('should correctly create V2 string to sign for PUT with md5 digest', (t) => {
  return testV2ToSign(t, {md5_digest: 'MD5Value'}, {}, {}, {
    computeContentMd5: true,
    cryptoMd5Method: function () { return 'MD5Value'; }
    })
      .then(function (result) {
        expect(result.result).to.equal(result.expected)
      })
})

test('should correctly create V2 string to sign with part-number-marker', (t) => {
  return testV2ListParts(t, {}, {}, {}, 5, 0)
      .then(function (result) {
        expect(testRequests[t.context.testId][19].url).to.match(/part-number-marker=2/)
      })
})
test('should correctly create V2 string to sign for truncated list parts', (t) => {
  let config = {
    name: t.context.requestedAwsObjectKey,
    file: new File({
      path: '/tmp/file',
      size: 29690176,
      name: randomAwsKey()
    })
  }
  return testV2ListParts(t, {}, {}, config, 5, 0)
      .then(function (result) {
        expect(result.result).to.equal(result.expected)
      })
})

test('should correctly create V4 string to sign for PUT', (t) => {
  return testV4ToSign(t)
    .then(function (result) {
      expect(result.result).to.equal('AWS4-HMAC-SHA256%0A' + result.datetime + '%0A' +
          result.datetime.slice(0, 8) + '%2Fus-east-1%2Fs3%2Faws4_request%0APUT%0A%2Fbucket%2F' + t.context.requestedAwsObjectKey +
              '%0ApartNumber%3D1' +
              '%26uploadId%3DHzr2sK034dOrV4gMsYK.MMrtWIS8JVBPKgeQ.LWd6H8V2PsLecsBqoA1cG1hjD3G4KRX_EBEwxWWDu8lNKezeA--' +
              '%0Acontent-md5%3AMD5Value%0Ahost%3As3.amazonaws.com' +
              '%0Atestid%3A' + encodeURIComponent(t.context.testId) +
              '%0Ax-amz-date%3A' + result.datetime + '%0A%0Acontent-md5%3Bhost%3Btestid%3Bx-amz-date%0AUNSIGNED-PAYLOAD')
    })
})
test('should correctly create V4 string to sign for PUT with amzHeaders', (t) => {
  return testV4ToSign(t, {xAmzHeadersCommon: { 'x-custom-header': 'peanuts' }})
      .then(function (result) {
        expect(result.result).to.equal('AWS4-HMAC-SHA256%0A' + result.datetime + '%0A' +
            result.datetime.slice(0, 8) + '%2Fus-east-1%2Fs3%2Faws4_request%0APUT%0A%2Fbucket%2F' + t.context.requestedAwsObjectKey +
            '%0ApartNumber%3D1' +
            '%26uploadId%3DHzr2sK034dOrV4gMsYK.MMrtWIS8JVBPKgeQ.LWd6H8V2PsLecsBqoA1cG1hjD3G4KRX_EBEwxWWDu8lNKezeA--' +
            '%0Acontent-md5%3AMD5Value%0Ahost%3As3.amazonaws.com' +
            '%0Atestid%3A' + encodeURIComponent(t.context.testId) +
            '%0Ax-amz-date%3A' + result.datetime + '%0Ax-custom-header%3Apeanuts%0A%0Acontent-md5%3Bhost%3Btestid%3Bx-amz-date%3Bx-custom-header%0AUNSIGNED-PAYLOAD')
      })
})
test('should correctly create V4 string to sign with part-number-marker', (t) => {
  return testV4ListParts(t, {}, 5, 0)
      .then(function (result) {
        expect(testRequests[t.context.testId][19].url).to.match(/part-number-marker=2/)
      })
})
test('should correctly create V4 string to sign for truncated list parts', (t) => {

  let config = {
    name: t.context.requestedAwsObjectKey,
    file: new File({
      path: '/tmp/file',
      size: 29690176,
      name: randomAwsKey()
    })
  }
  return testV4ListParts(t, {}, 5, 0)
      .then(function (result) {
        expect(result.result).to.equal('AWS4-HMAC-SHA256%0A' + result.datetime + '%0A' +
            result.datetime.slice(0, 8) + '%2Fus-east-1%2Fs3%2Faws4_request%0AGET%0A%2Fbucket%2F' + t.context.originalUploadObjectKey +
            '%0Apart-number-marker%3D2%26uploadId%3DHzr2sK034dOrV4gMsYK.MMrtWIS8JVBPKgeQ.LWd6H8V2PsLecsBqoA1cG1hjD3G4KRX_EBEwxWWDu8lNKezeA--' +
            '%0Ahost%3As3.amazonaws.com%0Atestid%3A' + encodeURIComponent(t.context.testId) +
            '%0Ax-amz-date%3A' + result.datetime + '%0A%0Ahost%3Btestid%3Bx-amz-date%0A')
      })
})

test('should default to V4 signature', (t) => {
  const config = {
    signerUrl: 'http://what.ever/signv4'
  }

  return testBase(t, {}, config)
      .then(function () {
        t.fail('Test succeeded but should have failed.')
      })
      .catch(function (reason) {
        expect(reason).to.match(/awsSignatureVersion is 4/)
      })
})

test('should fetch V2 authorization from the signerUrl without errors', (t) => {
  return testV2Authorization(t)
      .then(function () {
        expect(t.context.errMessages.length).to.equal(0)
      })
})
test('should fetch V2 authorization from the correct signing Url', (t) => {
  return testV2Authorization(t)
      .then(function () {
        expect(headersForMethod(t, 'GET', /\/signv2.*$/).testId).to.equal(t.context.testId)
      })
})


test('should fetch V2 authorization from the signerUrl', (t) => {
  return testV2Authorization(t)
      .then(function () {
        expect(t.context.authorization).to.equal(v2Authorization('1234567890123456789012345678'))
      })
})

test('should fetch V2 authorization from the signerUrl without canonical_request parameter present', (t) => {
  return testV4Authorization(t)
      .then(function () {
        const x = testRequests[t.context.testId][0];
        expect(x.url).to.not.match(/canonical_request=/)
      })
})

test('should fetch V2 authorization using the signResponseHandler and signerUrl without errors', (t) => {
  return testV2Authorization(t, {signResponseHandler: signResponseHandler})
      .then(function () {
        expect(t.context.errMessages.length).to.equal(0)
      })
})

test('should call signResponseHandler() with the correct number of parameters', (t) => {
  let handler = sinon.spy(signResponseHandler)
  return testV2Authorization(t, {signResponseHandler: handler})
      .then(function () {
        expect(handler.firstCall.args.length).to.eql(3)
      })
})

test('should fetch V2 authorization with the correct singer url using the signResponseHandler and signerUrl', (t) => {
  return testV2Authorization(t, {signResponseHandler: signResponseHandler})
      .then(function () {
        expect(headersForMethod(t, 'GET', /\/signv2.*$/).testId).to.equal(t.context.testId)
      })
})
test('should fetch V2 authorization using the signResponseHandler', (t) => {
  return testV2Authorization(t, {signResponseHandler: signResponseHandler})
      .then(function () {
        expect(t.context.authorization).to.equal(v2Authorization('1234567890123456789012345srh'))
      })
})

test('should fetch V2 authorization using the customAuthMethod without errors', (t) => {
   return testV2Authorization(t, {signerUrl: undefined, customAuthMethod: customAuthHandler})
      .then(function () {
        expect(t.context.errMessages.length).to.equal(0)
      })
})
test('should fetch V2 authorization using the customAuthMethod with the correct number of parameters', (t) => {
  const customAuth = sinon.spy(customAuthHandler)
  return testV2Authorization(t, {signerUrl: undefined, customAuthMethod: customAuth})
      .then(function () {
        const a = Array.prototype.slice.call(customAuth.firstCall.args)
        expect(a.length).to.equal(5)
      })
})
test('should fetch V2 authorization with a customAuthMethod without using signrUrl', (t) => {
  return testV2Authorization(t, {signerUrl: undefined, customAuthMethod: customAuthHandler})
      .then(function () {
        expect(typeof headersForMethod(t, 'GET', /\/signv2.*$/).testId).to.equal('undefined')
      })
})
test('should fetch V2 authorization using the customAuthMethod', (t) => {
  return testV2Authorization(t, {signerUrl: undefined, customAuthMethod: customAuthHandler})
      .then(function () {
        expect(t.context.authorization).to.equal(v2Authorization('123456789012345678901234cstm'))
      })
})

test('should fetch V4 authorization from the signerUrl without errors', (t) => {
  return testV4Authorization(t, {})
      .then(function () {
        expect(t.context.errMessages.length).to.equal(0)
      })
})
test('should fetch V4 authorization from the signerUrl and call the correct signing url', (t) => {
  return testV4Authorization(t, {})
      .then(function () {
        expect(headersForMethod(t, 'GET', /\/signv4.*$/).testId).to.equal(t.context.testId)
      })
})
test('should fetch V4 authorization from the signerUrl', (t) => {
  return testV4Authorization(t, {})
      .then(function () {
        expect(t.context.authorization).to.equal(v4Authorization('12345678901234567890123456v4'))
      })
})

test('should fetch V4 authorization using the signResponseHandler and signerUrl without errors', (t) => {
  return testV4Authorization(t, {signResponseHandler: signResponseHandler})
      .then(function () {
        expect(t.context.errMessages.length).to.equal(0)
      })
})

test('should fetch V4 authorization from the signerUrl without canonical_request parameter present', (t) => { 
  return testV4Authorization(t) 
      .then(function () { 
        const x = testRequests[t.context.testId][0];
        expect(x.url).to.not.match(/canonical_request=/) 
      })
})

test('should fetch V4 authorization from the signerUrl with canonical_request parameter present, if enabled', (t) => {
  return testV4Authorization(t, {sendCanonicalRequestToSignerUrl: true})
      .then(function () {
        const x = testRequests[t.context.testId][0];
        expect(x.url).to.match(/canonical_request=/)
      })
})

test('should fetch V4 authorization using the signResponseHandler and signerUrl and call the correct signing url', (t) => {
  return testV4Authorization(t, {signResponseHandler: signResponseHandler})
      .then(function () {
        expect(headersForMethod(t, 'GET', /\/signv4.*$/).testId).to.equal(t.context.testId)
      })
})
test('should fetch V4 authorization using the signResponseHandler and signerUrl', (t) => {
  return testV4Authorization(t, {signResponseHandler: signResponseHandler})
      .then(function () {
        expect(t.context.authorization).to.equal(v4Authorization('1234567890123456789012345srh'))
      })
})

test('should fetch V4 authorization using the customAuthMethod without errors', (t) => {
  return testV4Authorization(t, {signerUrl: undefined, customAuthMethod: customAuthHandler})
      .then(function () {
        expect(t.context.errMessages.length).to.equal(0)
      })
})
test('should fetch V4 authorization using the customAuthMethod with the correct number of parameters', (t) => {
  const customAuth = sinon.spy(customAuthHandler)
  return testV4Authorization(t, {signerUrl: undefined, customAuthMethod: customAuth})
      .then(function () {
        const a = Array.prototype.slice.call(customAuth.firstCall.args)
        expect(a.length).to.equal(5)
      })
})
test('should fetch V4 authorization using the customAuthMethod', (t) => {
  return testV4Authorization(t, {signerUrl: undefined, customAuthMethod: customAuthHandler})
      .then(function () {
        expect(typeof headersForMethod(t, 'GET', /\/signv4.*$/).testId).to.equal('undefined')
      })
})
test('should fetch V4 authorization using the customAuthMethod without signerUrl', (t) => {
  return testV4Authorization(t, {signerUrl: undefined, customAuthMethod: customAuthHandler})
      .then(function () {
        expect(t.context.authorization).to.equal(v4Authorization('123456789012345678901234cstm'))
      })
})

test('should fetch authorization using a custom Authorization Method (awsLambda)', (t) => {
  let AWSLambda = function (payload) {
    this.payload = payload;
  }
  AWSLambda.prototype.invoke = function (params, cb) {
    const data = {
      Payload: '"' + this.payload + '"'
    }
    cb('', data)
  }

  let authorizationMethod = function (signParams, signHeaders, stringToSign, dateString) {
    return new Promise(function(resolve, reject) {
      new AWSLambda('abcdLambdaV2').invoke({
        FunctionName: function () {},
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify({
          to_sign: stringToSign,
          sign_params: signParams,
          sign_headers: signHeaders
        })
      }, function (err, data) {
        if (err) {
          return reject(err);
        }
        resolve(JSON.parse(data.Payload));
      });
    });
  };

  return testV2Authorization(t, {customAuthMethod: authorizationMethod, signerUrl: undefined,})
      .then(function () {
        expect(t.context.errMessages.length).to.equal(0)
      })
})

test('should fetch V4 authorization with header "x-amz-content-sha256" for INIT', (t) => {
  return testV4Authorization(t)
      .then(function () {
        expect(headersForMethod(t, 'POST', /^.*\?uploads.*$/)['x-amz-content-sha256']).to.equal('')
      })
})
test('should fetch V4 authorization with header "x-amz-content-sha256" for PUT', (t) => {
  return testV4Authorization(t)
      .then(function () {
        expect(headersForMethod(t, 'PUT', /^.*$/)['x-amz-content-sha256']).to.equal('UNSIGNED-PAYLOAD')
      })
})
test('should fetch V4 authorization with header "x-amz-content-sha256" for COMPLETE', (t) => {
  return testV4Authorization(t)
      .then(function () {
        expect(headersForMethod(t, 'POST', /.*\?uploadId.*$/)['x-amz-content-sha256']).to.equal('<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag></ETag></Part></CompleteMultipartUpload>')
      })
})

// Auth Error Handling

test('should abort on 404 in V2 Signature PUT should return errors and call the correct signer url', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }
  t.context.errorStatus = 404

  return testV2Authorization(t)
      .then(function () {
            t.fail('Cancel promise should have rejected, but did not.')
      },
      function () {
        expect(headersForMethod(t, 'GET', /\/signv2.*$/).testId).to.equal(t.context.testId)
      })
})
test('should abort on 404 in V2 Signature PUT should return errors and return error messages', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }
  t.context.errorStatus = 404

  return testV2Authorization(t)
      .then(function () {
        t.fail('Cancel promise should have rejected, but did not.')
      },
      function (reason) {
        expect(t.context.errMessages.join(',')).to.match(/404 error on part PUT. The part and the file will abort/i)
      })
})
test('should abort on 404 in V2 Signature PUT promise should reject with reason', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }
  t.context.errorStatus = 404

  return testV2Authorization(t)
      .then(function () {
            t.fail('Cancel promise should have rejected, but did not.')
          },
          function (reason) {
            expect(reason).to.match(/part failing to upload/i)
          })
})

test('should return error when ABORT fails and call the correct signing url', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }
  t.context.errorStatus = 404
  t.context.deleteStatus = 403

  return testV2Authorization(t)
      .then(function () {
            t.fail('Expected an error but found none: ' + t.context.testId)
          }, function (reason) {
            expect(headersForMethod(t, 'GET', /\/signv2.*$/).testId).to.equal(t.context.testId)
          }
      )
})
test('should return error when ABORT fails and return error messages (1)', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }
  t.context.errorStatus = 404
  t.context.deleteStatus = 403

  return testV2Authorization(t)
      .then(function () {
            t.fail('Expected an error but found none: ' + t.context.testId)
          }, function (reason) {
        expect(t.context.errMessages.join(',')).to.match(/status:403/)
          }
      )
})

test('should return error when listParts fails in Abort after part upload failure (404) and call the signing url', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }
  t.context.errorStatus = 404
  t.context.getPartsStatus = 403

  return testV2Authorization(t)
      .then(function () {
            t.fail('Expected an error but found none: ' + t.context.testId)
          },
          function (reason) {
            expect(headersForMethod(t, 'GET', /\/signv2.*$/).testId).to.equal(t.context.testId)
          })
})
test('should return error when listParts fails in Abort after part upload failure (404) and return error messages (1)', (t) => {
  t.context.retry = function (type) {
    return type === 'part'
  }
  t.context.errorStatus = 404
  t.context.getPartsStatus = 403

  return testV2Authorization(t)
      .then(function () {
            t.fail('Expected an error but found none: ' + t.context.testId)
          },
          function (reason) {
            expect(t.context.errMessages.join(',')).to.match(/404 error on part PUT\. The part and the file will abort/i)
          })
})

// signParams and signHeaders
test('should apply signParams in the V2 signature request', (t) => {
  return testV2Authorization(t, {
    awsSignatureVersion: '2',
    signParams: { 'signing-auth': 'token' }
  })
      .then(function () {
        expect(testRequests[t.context.testId][0].url).to.match(/signing-auth=token/)
      })
})
test('should pass signHeaders to the V2 signature request', (t) => {
  return testV2Authorization(t, {
    awsSignatureVersion: '2',
    signHeaders: { 'signing-auth': 'token' }
  })
      .then(function () {
        expect(headersForMethod(t, 'GET', /\/sign.*$/)['signing-auth']).to.equal('token')
      })
})
test('should apply signParams in the V4 signature request', (t) => {
  return testV4Authorization(t, {
    awsSignatureVersion: '2',
    signParams: { 'signing-auth': 'token' }
  })
      .then(function () {
        expect(testRequests[t.context.testId][0].url).to.match(/signing-auth=token/)
      })
})
test('should pass signHeaders to the V4 signature request', (t) => {
  return testV4Authorization(t, {
    awsSignatureVersion: '2',
    signHeaders: { 'signing-auth': 'token' }
  })
      .then(function () {
        expect(headersForMethod(t, 'GET', /\/sign.*$/)['signing-auth']).to.equal('token')
      })
})
