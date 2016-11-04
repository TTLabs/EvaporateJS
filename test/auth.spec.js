import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

let server;

const signResponseHandler = function  (response, stringToSign, signatureDateTime) {
  return '1234567890123456789012345srh';
}

function testCommonAuthorization(t, addCfg, evapConfig) {
  const addConfig = Object.assign({}, t.context.baseAddConfig, addCfg, {
    error: function (msg) {
      t.context.errMessages.push(msg);
    }})

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
    cryptoHexEncodedHash256: function () { return 'SHA256Value'; }
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

let AWSLambda = function (payload) {
  this.payload = payload;
}
AWSLambda.prototype.invoke = function (params, cb) {
  const data = {
    Payload: '"' + this.payload + '"'
  }
  cb('', data)
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

test('should correctly create V4 string to sign for PUT', (t) => {
  return testV4ToSign(t)
    .then(function (result) {
      expect(result.result).to.equal('AWS4-HMAC-SHA256%0A' + result.datetime + '%0A' +
          result.datetime.slice(0, 8) + '%2Fus-east-1%2Fs3%2Faws4_request%0APUT%0A%2F%0A%0Acontent-md5%3AMD5Value%0Ahost%3As3.amazonaws.com' +
              '%0Atestid%3A' + encodeURIComponent(t.context.testId) +
              '%0Ax-amz-date%3A' + result.datetime + '%0A%0Acontent-md5%3Bhost%3Btestid%3Bx-amz-date%0AUNSIGNED-PAYLOAD')
    })
})

test('should correctly create V4 string to sign for PUT with amzHeaders', (t) => {
  return testV4ToSign(t, {xAmzHeadersCommon: { 'x-custom-header': 'peanuts' }})
      .then(function (result) {
        expect(result.result).to.equal('AWS4-HMAC-SHA256%0A' + result.datetime + '%0A' +
            result.datetime.slice(0, 8) + '%2Fus-east-1%2Fs3%2Faws4_request%0APUT%0A%2F%0A%0Acontent-md5%3AMD5Value%0Ahost%3As3.amazonaws.com' +
            '%0Atestid%3A' + encodeURIComponent(t.context.testId) +
            '%0Ax-amz-date%3A' + result.datetime + '%0Ax-custom-header%3Apeanuts%0A%0Acontent-md5%3Bhost%3Btestid%3Bx-amz-date%3Bx-custom-header%0AUNSIGNED-PAYLOAD')
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

test('should fetch V2 authorization using the signResponseHandler even with signerUrl without errors', (t) => {
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

test('should fetch V2 authorization with the correct singer url using the signResponseHandler even with signerUrl', (t) => {
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

test('should fetch V2 authorization using the signResponseHandler without signerUrl without errors', (t) => {
   return testV2Authorization(t, {signerUrl: undefined, signResponseHandler: signResponseHandler})
      .then(function () {
        expect(t.context.errMessages.length).to.equal(0)
      })
})
test('should fetch V2 authorization with the correct singer url using the signResponseHandler without signerUrl', (t) => {
  return testV2Authorization(t, {signerUrl: undefined, signResponseHandler: signResponseHandler})
      .then(function () {
        expect(typeof headersForMethod(t, 'GET', /\/signv2.*$/).testId).to.equal('undefined')
      })
})
test('should fetch V2 authorization using the signResponseHandler without signerUrl', (t) => {
  return testV2Authorization(t, {signerUrl: undefined, signResponseHandler: signResponseHandler})
      .then(function () {
        expect(t.context.authorization).to.equal(v2Authorization('1234567890123456789012345srh'))
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

test('should fetch V4 authorization using the signResponseHandler even with signerUrl without errors', (t) => {
  return testV4Authorization(t, {signResponseHandler: signResponseHandler})
      .then(function () {
        expect(t.context.errMessages.length).to.equal(0)
      })
})
test('should fetch V4 authorization using the signResponseHandler even with signerUrl and call the correct signing url', (t) => {
  return testV4Authorization(t, {signResponseHandler: signResponseHandler})
      .then(function () {
        expect(headersForMethod(t, 'GET', /\/signv4.*$/).testId).to.equal(t.context.testId)
      })
})
test('should fetch V4 authorization using the signResponseHandler even with signerUrl', (t) => {
  return testV4Authorization(t, {signResponseHandler: signResponseHandler})
      .then(function () {
        expect(t.context.authorization).to.equal(v4Authorization('1234567890123456789012345srh'))
      })
})

test('should fetch V4 authorization using the signResponseHandler without signerUrl without errors', (t) => {
  return testV4Authorization(t, {signerUrl: undefined, signResponseHandler: signResponseHandler})
      .then(function () {
        expect(t.context.errMessages.length).to.equal(0)
      })
})
test('should fetch V4 authorization using the signResponseHandler without calling signerUrl', (t) => {
  return testV4Authorization(t, {signerUrl: undefined, signResponseHandler: signResponseHandler})
      .then(function () {
        expect(typeof headersForMethod(t, 'GET', /\/signv4.*$/).testId).to.equal('undefined')
      })
})
test('should fetch V4 authorization using the signResponseHandler without signerUrl', (t) => {
  return testV4Authorization(t, {signerUrl: undefined, signResponseHandler: signResponseHandler})
      .then(function () {
        expect(t.context.authorization).to.equal(v4Authorization('1234567890123456789012345srh'))
      })
})

test('should fetch V2 authorization using awsLambda without errors', (t) => {
  return testV2Authorization(t, {awsLambda: new AWSLambda('abcdLambdaV2'), awsLambdaFunction: function () {}})
      .then(function () {
        expect(t.context.errMessages.length).to.equal(0)
      })
})
test('should fetch V2 authorization using awsLambda should not use signing url', (t) => {
  return testV2Authorization(t, {awsLambda: new AWSLambda('abcdLambdaV2'), awsLambdaFunction: function () {}})
      .then(function () {
        expect(typeof headersForMethod(t, 'GET', /\/signv2.*$/).testId).to.equal('undefined')
      })
})
test('should fetch V2 authorization using awsLambda', (t) => {
  return testV2Authorization(t, {awsLambda: new AWSLambda('abcdLambdaV2'), awsLambdaFunction: function () {}})
      .then(function () {
        expect(t.context.authorization).to.equal(v2Authorization('abcdLambdaV2'))
      })
})

test('should fetch V4 authorization using awsLambda without errors', (t) => {
  return testV4Authorization(t, {awsLambda: new AWSLambda('abcdLambdaV4'), awsLambdaFunction: function () {}})
      .then(function () {
        expect(t.context.errMessages.length).to.equal(0)
      })
})
test('should fetch V4 authorization using awsLambda and not call the signing url', (t) => {
  return testV4Authorization(t, {awsLambda: new AWSLambda('abcdLambdaV4'), awsLambdaFunction: function () {}})
      .then(function () {
        expect(typeof headersForMethod(t, 'GET', /\/signv4.*$/).testId).to.equal('undefined')
      })
})
test('should fetch V4 authorization using awsLambda', (t) => {
  return testV4Authorization(t, {awsLambda: new AWSLambda('abcdLambdaV4'), awsLambdaFunction: function () {}})
      .then(function () {
        expect(t.context.authorization).to.equal(v4Authorization('abcdLambdaV4'))
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

test('should return error when list parts fails after calling correct signing url', (t) => {
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
test('should return error when list parts fails with error messages (1)', (t) => {
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
test('should apply signParams in the signature request', (t) => {
  return testBase(t, {}, {
    signParams: { 'signing-auth': 'token' }
  })
      .then(function () {
        expect(testRequests[t.context.testId][0].url).to.match(/signing-auth=token/)
      })
})
test('should pass signHeaders to the signature request', (t) => {
  return testBase(t, {}, {
    signHeaders: { 'signing-auth': 'token' }
  })
      .then(function () {
        expect(headersForMethod(t, 'GET', /\/sign.*$/)['signing-auth']).to.equal('token')
      })
})
