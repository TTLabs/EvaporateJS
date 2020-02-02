(() => {
  function signingVersion(awsRequest, l) {
    var con = awsRequest.con;
    function AwsSignature(request) {
      this.request = request;
    }
    AwsSignature.prototype.request = {};
    AwsSignature.prototype.error = function () {};
    AwsSignature.prototype.authorizationString = function () {};
    AwsSignature.prototype.stringToSign = function () {};
    AwsSignature.prototype.canonicalRequest = function () {};
    AwsSignature.prototype.setHeaders = function () {};
    AwsSignature.prototype.datetime = function (timeOffset) {
      return new Date(new Date().getTime() + timeOffset);

    };
    AwsSignature.prototype.dateString = function (timeOffset) {
      return this.datetime(timeOffset).toISOString().slice(0, 19).replace(/-|:/g, '') + "Z";
    };

    function AwsSignatureV2(request) {
      AwsSignature.call(this, request);
    }
    AwsSignatureV2.prototype = Object.create(AwsSignature.prototype);
    AwsSignatureV2.prototype.constructor = AwsSignatureV2;
    AwsSignatureV2.prototype.authorizationString = function () {
      return ['AWS ', con.aws_key, ':', this.request.auth].join('');
    };
    AwsSignatureV2.prototype.stringToSign = function () {
      var x_amz_headers = '', result, header_key_array = [];

      for (var key in this.request.x_amz_headers) {
        if (this.request.x_amz_headers.hasOwnProperty(key)) {
          header_key_array.push(key);
        }
      }
      header_key_array.sort();

      header_key_array.forEach(function (header_key) {
        x_amz_headers += (header_key + ':' + this.request.x_amz_headers[header_key] + '\n');
      }.bind(this));

      result = this.request.method + '\n' +
          (this.request.md5_digest || '') + '\n' +
          (this.request.contentType || '') + '\n' +
          '\n' +
          x_amz_headers +
          (con.cloudfront ? '/' + con.bucket : '') +
          awsRequest.getPath() + this.request.path;

      l.d('V2 stringToSign:', result);
      return result;

    };
    AwsSignatureV2.prototype.dateString = function (timeOffset) {
      return this.datetime(timeOffset).toUTCString();
    };
    AwsSignatureV2.prototype.getPayload = function () { return Promise.resolve(); };

    function AwsSignatureV4(request) {
      this._cr = undefined
      AwsSignature.call(this, request);
    }
    AwsSignatureV4.prototype = Object.create(AwsSignature.prototype);
    AwsSignatureV4.prototype.constructor = AwsSignatureV4;
    AwsSignatureV4.prototype._cr = undefined;
    AwsSignatureV4.prototype.payload = null;
    AwsSignatureV4.prototype.error = function () { this._cr = undefined; };
    AwsSignatureV4.prototype.getPayload = function () {
      return awsRequest.getPayload()
          .then(function (data) {
            this.payload = data;
          }.bind(this));
    };
    AwsSignatureV4.prototype.authorizationString = function () {
      var authParts = [];

      var credentials = this.credentialString();
      var headers = this.canonicalHeaders();

      authParts.push(['AWS4-HMAC-SHA256 Credential=', con.aws_key, '/', credentials].join(''));
      authParts.push('SignedHeaders=' + headers.signedHeaders);
      authParts.push('Signature=' + this.request.auth);

      return authParts.join(', ');
    };
    AwsSignatureV4.prototype.stringToSign = function () {
      var signParts = [];
      signParts.push('AWS4-HMAC-SHA256');
      signParts.push(this.request.dateString);
      signParts.push(this.credentialString());
      signParts.push(con.cryptoHexEncodedHash256(this.canonicalRequest()));
      var result = signParts.join('\n');

      l.d('V4 stringToSign:', result);
      return result;
    };
    AwsSignatureV4.prototype.credentialString = function () {
      var credParts = [];

      credParts.push(this.request.dateString.slice(0, 8));
      credParts.push(con.awsRegion);
      credParts.push('s3');
      credParts.push('aws4_request');
      return credParts.join('/');
    };
    AwsSignatureV4.prototype.canonicalQueryString = function () {
      var qs = awsRequest.request.query_string || '',
          search = uri([awsRequest.awsUrl, this.request.path, qs].join("")).search,
          searchParts = search.length ? search.split('&') : [],
          encoded = [],
          nameValue,
          i;

      for (i = 0; i < searchParts.length; i++) {
        nameValue = searchParts[i].split("=");
        encoded.push({
          name: encodeURIComponent(nameValue[0]),
          value: nameValue.length > 1 ? encodeURIComponent(nameValue[1]) : null
        })
      }
      var sorted = encoded.sort(function (a, b) {
        if (a.name < b.name) {
          return -1;
        } else if (a.name > b.name) {
          return 1;
        }
        return 0;
      });

      var result = [];
      for (i = 0; i < sorted.length; i++) {
        nameValue = sorted[i].value ? [sorted[i].name, sorted[i].value].join("=") : sorted[i].name + '=';
        result.push(nameValue);
      }

      return result.join('&');
    };
    AwsSignatureV4.prototype.getPayloadSha256Content = function () {
      var result = this.request.contentSha256 || con.cryptoHexEncodedHash256(this.payload || '');
      l.d(this.request.step, 'getPayloadSha256Content:', result);
      return result;
    };
    AwsSignatureV4.prototype.canonicalHeaders = function () {
      var canonicalHeaders = [],
          keys = [],
          i;

      function addHeader(name, value) {
        var key = name.toLowerCase();
        keys.push(key);
        canonicalHeaders[key] = value.replace(/\s+/g, ' ');
      }

      if (this.request.md5_digest) {
        addHeader("Content-Md5", this.request.md5_digest);
      }

      addHeader('Host', awsRequest.awsHost);

      if (this.request.contentType) {
        addHeader('Content-Type', this.request.contentType || '');
      }

      var amzHeaders = this.request.x_amz_headers || {};
      for (var key in amzHeaders) {
        if (amzHeaders.hasOwnProperty(key)) {
          addHeader(key, amzHeaders[key]);
        }
      }

      var sortedKeys = keys.sort(function (a, b) {
        if (a < b) {
          return -1;
        } else if (a > b) {
          return 1;
        }
        return 0;
      });

      var result = [];

      var unsigned_headers = [],
          not_signed = this.request.not_signed_headers || [],
          signed_headers = [];
      for (i = 0; i < not_signed.length; i++) {
        unsigned_headers.push(not_signed[i].toLowerCase());
      }

      for (i = 0; i < sortedKeys.length; i++) {
        var k = sortedKeys[i];
        result.push([k, canonicalHeaders[k]].join(":"));
        if (unsigned_headers.indexOf(k) === -1) {
          signed_headers.push(k);
        }
      }

      return {
        canonicalHeaders: result.join("\n"),
        signedHeaders: signed_headers.join(";")
      };
    };
    AwsSignatureV4.prototype.canonicalRequest = function () {
      if (typeof this._cr !== 'undefined') { return this._cr; }
      var canonParts = [];

      canonParts.push(this.request.method);
      canonParts.push(uri([awsRequest.awsUrl, awsRequest.getPath(), this.request.path].join("")).pathname);
      canonParts.push(this.canonicalQueryString() || '');

      var headers = this.canonicalHeaders();
      canonParts.push(headers.canonicalHeaders + '\n');
      canonParts.push(headers.signedHeaders);
      canonParts.push(this.getPayloadSha256Content());

      this._cr = canonParts.join("\n");
      l.d(this.request.step, 'V4 CanonicalRequest:', this._cr);
      return this._cr;
    };
    AwsSignatureV4.prototype.setHeaders = function (xhr) {
      xhr.setRequestHeader("x-amz-content-sha256", this.getPayloadSha256Content());
    };

    return con.awsSignatureVersion === '4' ? AwsSignatureV4 : AwsSignatureV2;
  }

  function noOpLogger() { return {d: function () {}, w: function () {}, e: function () {}}; }

  l = noOpLogger();
})();