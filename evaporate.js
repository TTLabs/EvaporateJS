/*Copyright (c) 2016, TT Labs, Inc.
 All rights reserved.

 Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

 Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

 Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

 Neither the name of the TT Labs, Inc. nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.*/


/***************************************************************************************************
 *                                                                                                  *
 *  version 1.6.0                                                                                   *
 *                                                                                                  *
 ***************************************************************************************************/

(function () {
    "use strict";

    var FAR_FUTURE = new Date('2060-10-22');

    var Evaporate = function (config) {

        var PENDING = 0, EVAPORATING = 2, COMPLETE = 3, PAUSED = 4, CANCELED = 5, ERROR = 10, ABORTED = 20, PAUSING = 30, ETAG_OF_0_LENGTH_BLOB = '"d41d8cd98f00b204e9800998ecf8427e"';
        var IMMUTABLE_OPTIONS = [
            'maxConcurrentParts',
            'logging',
            'cloudfront',
            'aws_url',
            'encodeFilename',
            'computeContentMd5',
            'allowS3ExistenceOptimization',
            'onlyRetryForSameFileName',
            'timeUrl',
            'cryptoMd5Method',
            'cryptoHexEncodedHash256',
            'aws_key',
            'awsRegion',
            'awsSignatureVersion',
            'evaporateChanged'
        ];
        var PARTS_MONITOR_INTERVALS = {
                online: 2 * 60 * 1000, // 2 minutes
                offline: 20 * 1000 // 20 seconds
            },
            partsMonitorInterval = PARTS_MONITOR_INTERVALS.online;

        var _ = this;
        var files = [],
            evaporatingCount = 0;

        function noOpLogger() { return {d: function () {}, w: function () {}, e: function () {}}; }

        var l = noOpLogger();

        var con = extend({
            bucket: null,
            logging: true,
            maxConcurrentParts: 5,
            partSize: 6 * 1024 * 1024,
            retryBackoffPower: 2,
            maxRetryBackoffSecs: 300,
            progressIntervalMS: 500,
            cloudfront: false,
            s3Acceleration: false,
            encodeFilename: true,
            computeContentMd5: false,
            allowS3ExistenceOptimization: false,
            onlyRetryForSameFileName: false,
            timeUrl: null,
            cryptoMd5Method: null,
            cryptoHexEncodedHash256: null,
            aws_key: null,
            awsRegion: 'us-east-1',
            awsSignatureVersion: '2',
            s3FileCacheHoursAgo: null, // Must be a whole number of hours. Will be interpreted as negative (hours in the past).
            signParams: {},
            signHeaders: {},
            awsLambda: null,
            awsLambdaFunction: null,
            maxFileSize: null,
            signResponseHandler: null,
            xhrWithCredentials: false,
            // undocumented
            testUnsupported: false,
            simulateStalling: false,
            simulateErrors: false,
            evaporateChanged: function () {},
            abortCompletionThrottlingMs: 1000
        }, config);

        if (typeof window !== 'undefined' && window.console) {
            l = window.console;
            l.d = l.log;
            l.w = window.console.warn ? l.warn : l.d;
            l.e = window.console.error ? l.error : l.d;
        }

        this.supported = !(
            typeof File === 'undefined' ||
            typeof Blob === 'undefined' ||
            typeof (
            Blob.prototype.webkitSlice ||
            Blob.prototype.mozSlice ||
            Blob.prototype.slice) === 'undefined' ||
            !!config.testUnsupported);

        if (!con.signerUrl && typeof con.signResponseHandler !== 'function') {
            l.e("Option signerUrl is required unless signResponseHandler is present.");
            return;
        }

        if (!con.bucket) {
            l.e("The AWS 'bucket' option must be present.");
            return;
        }

        if (!this.supported) {
            l.e('The browser does not support the necessary features of File and Blob [webkitSlice || mozSlice || slice]');
            return;
        }

        if (con.computeContentMd5) {
            this.supported = typeof FileReader.prototype.readAsArrayBuffer !== 'undefined';
            if (!this.supported) {
                l.e('The browser\'s FileReader object does not support readAsArrayBuffer');
                return;
            }

            if (typeof con.cryptoMd5Method !== 'function') {
                l.e('Option computeContentMd5 has been set but cryptoMd5Method is not defined.');
                return;
            }

            if (con.awsSignatureVersion === '4') {
                if (typeof con.cryptoHexEncodedHash256 !== 'function') {
                    l.e('Option awsSignatureVersion is 4 but cryptoHexEncodedHash256 is not defined.');
                    return;
                }
            }
        } else if (con.awsSignatureVersion === '4') {
            l.e('Option awsSignatureVersion is 4 but computeContentMd5 is not enabled.');
            return;
        }

        if (!con.logging) {
            // Reset the logger to be a no_op
            l = noOpLogger();
        }

        var historyCache = {
            supported: (function () {
                var result = false;
                if (typeof window !== 'undefined') {
                    if (!('localStorage' in window)) {
                        return result;
                    }
                } else {
                    return result;
                }

                // Try to use storage (it might be disabled, e.g. user is in private mode)
                try {
                    localStorage.setItem('___test', 'OK');
                    var test = localStorage.getItem('___test');
                    localStorage.removeItem('___test');

                    result = test === 'OK';
                } catch (e) {
                    return result;
                }

                return result;
            }()),
            getItem: function (key) {
                if (this.supported) {
                    return localStorage.getItem(key)
                }
            },
            setItem: function (key, value) {
                if (this.supported) {
                    return localStorage.setItem(key, value);
                }
            },
            clear: function () {
                if (this.supported) {
                    return localStorage.clear();
                }
            },
            key: function (key) {
                if (this.supported) {
                    return localStorage.key(key);
                }
            },
            removeItem: function (key) {
                if (this.supported) {
                    return localStorage.removeItem(key);
                }
            }
        };

        var url;
        if (con.aws_url) {
            url = [con.aws_url];
        } else {
            if (con.s3Acceleration) {
                url = ["https://", con.bucket, ".s3-accelerate"];
                con.cloudfront = true;
            } else {
                url = ["https://", (con.cloudfront ? con.bucket + "." : ""), "s3"];
                if (con.awsRegion !== "us-east-1") {
                    url.push("-", con.awsRegion);
                }
            }
            url.push(".amazonaws.com");
        }
        var AWS_URL = url.join("");
        var AWS_HOST = uri(AWS_URL).hostname;

        var _d = new Date(),
            HOURS_AGO = new Date(_d.setHours(_d.getHours() - (con.s3FileCacheHoursAgo || -100))),
            localTimeOffset = 0;

        if (con.timeUrl) {
            var xhr = new XMLHttpRequest();

            xhr.open("GET", con.timeUrl + '?requestTime=' + new Date().getTime());
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        var server_date = new Date(Date.parse(xhr.responseText)),
                            now = new Date();
                        localTimeOffset = now - server_date;
                        l.d('localTimeOffset is', localTimeOffset, 'ms');
                    }
                }
            };

            xhr.onerror = function () {
                l.e('xhr error timeUrl', xhr);
            };
            xhr.send();
        }

        //con.simulateStalling =  true

        _.add = function (file,  pConfig) {
            var c = extend(pConfig, {});

            IMMUTABLE_OPTIONS.map(function (a) { delete c[a]; });

            var fileConfig = extend(con, c);

            l.d('add');
            var err;
            if (typeof file === 'undefined') {
                return 'Missing file';
            }
            if (fileConfig.maxFileSize && file.file.size > fileConfig.maxFileSize) {
                return 'File size too large. Maximum size allowed is ' + fileConfig.maxFileSize;
            }
            if (typeof file.name === 'undefined') {
                err = 'Missing attribute: name  ';
            } else if (fileConfig.encodeFilename) {
                // correctly encode to an S3 object name, considering '/' and ' '
                file.name = s3EncodedObjectName(file.name);
            }

            /*if (!(file.file instanceof File)){
             err += '.file attribute must be instanceof File';
             }*/
            if (err) { return err; }

            var newId = addFile(file, fileConfig);
            setTimeout(processQueue, 1);
            return newId;
        };

        _.cancel = function (id) {

            l.d('cancel ', id);
            if (files[id]) {
                files[id].stop();
                return true;
            } else {
                return false;
            }
        };

        _.pause = function (id, options) {
            options = options || {};
            var force = options.force === 'undefined' ? false : options.force,
                typeOfId = typeof id;
            if (typeOfId === 'undefined') {
                l.d('Pausing all file uploads');
                files.forEach(function (file) {
                   if ([PENDING, EVAPORATING, ERROR].indexOf(file.status) > -1)  {
                       file.pause(force);
                   }
                });
            }  else if (typeof files[id] === 'undefined') {
                l.w('Cannot pause a file that has not been added.');
            } else if (files[id].status === PAUSED) {
                l.w('Cannot pause a file that is already paused. Status:', files[id].status);
            } else {
                files[id].pause(force);
            }
        };

        _.resume = function (id) {
            var PAUSED_STATUSES = [PAUSED, PAUSING];
            if (typeof id === 'undefined') {
                l.d('Resuming all file uploads');
                files.forEach(function (file) {
                    if (PAUSED_STATUSES.indexOf(file.status) > -1)  {
                        file.resume();
                    }
                });
            }  else if (typeof files[id] === 'undefined') {
                l.w('Cannot pause a file that does not exist.');
            } else if (PAUSED_STATUSES.indexOf(files[id].status) === -1) {
                l.w('Cannot resume a file that has not been paused. Status:', files[id].status);
            } else {
                files[id].resume();
            }
        };

        _.forceRetry = function () {};

        function addFile(file, fileConfig) {

            var id = files.length;
            files.push(new FileUpload(extend({
                started: function () {},
                progress: function () {},
                complete: function () {},
                cancelled: function () {},
                paused: function () {},
                resumed: function () {},
                pausing: function () {},
                info: function () {},
                warn: function () {},
                error: function () {},
                xAmzHeadersAtInitiate: {},
                notSignedHeadersAtInitiate: {},
                xAmzHeadersCommon: null,
                xAmzHeadersAtUpload: {},
                xAmzHeadersAtComplete: {}
            }, file, {
                id: id,
                status: PENDING,
                priority: 0,
                onStatusChange: onFileUploadStatusChange,
                loadedBytes: 0,
                sizeBytes: file.file.size,
                eTag: ''
            }), fileConfig));
            return id;
        }

        function onFileUploadStatusChange() {
            l.d('onFileUploadStatusChange');
            processQueue();
        }

        function s3EncodedObjectName(fileName) {
            var fileParts = fileName.split('/'),
                encodedParts = [];
            fileParts.forEach(function (p) {
                encodedParts.push(encodeURIComponent(p).replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/'/, "%27"));
            });
            return encodedParts.join('/');
        }

        function processQueue() {
            l.d('processQueue   length:', files.length);
            var next = -1, priorityOfNext = -1, readyForNext = true;
            files.forEach(function (file, i) {

                if (file.priority > priorityOfNext && file.status === PENDING) {
                    next = i;
                    priorityOfNext = file.priority;
                }

                if (file.status === EVAPORATING) {
                    readyForNext = false;
                }
            });

            if (readyForNext && next >= 0) {
                files[next].start();
            }
        }


        function FileUpload(file, con) {
            var me = this, s3Parts = [], partsOnS3 = [], partsToUpload = [], progressTotalInterval, progressPartsInterval, countUploadAttempts = 0,
                partsInProcess = [], fileTotalBytesUploaded = 0;

            var partsPromise,
                partsDeferredPromises = [];

            extend(me, file);


            function evaporatingCnt(incr) {
                evaporatingCount = Math.max(0, evaporatingCount + incr);
                con.evaporateChanged(me, evaporatingCount);
            }

            me.signParams = con.signParams;

            me.start = function () {
                l.d('starting FileUpload', me.id);
                me.started(me.id);

                if (me.status === ABORTED) {
                  return;
                }

                var awsKey = me.name;

                getUnfinishedFileUpload();

                if (typeof me.uploadId === 'undefined') {
                    // New File
                    return new InitiateMultipartUpload(awsKey).send();
                }

                if (typeof me.eTag === 'undefined' || !me.firstMd5Digest || !con.computeContentMd5) {
                    if (partsOnS3.length) { // Resume after Pause
                        me.status = EVAPORATING;
                        return startFileProcessing();
                    } else { // Recovery after client error/browser refresh during upload after some parts completed
                        // File with some parts on S3
                        return new GetMultipartUploadParts().send();
                    }
                }

                // Attempt to reuse entire uploaded object on S3
                var firstPart = makePart(1, PENDING, 1);
                partsToUpload.push(firstPart);
                firstPart.awsRequest.getPartMd5Digest()
                    .then(function () {
                        return new ReuseS3Object(awsKey).send();
                    });
            };

            me.stop = function () {
                l.d('stopping FileUpload ', me.id);
                setStatus(CANCELED);
                me.info('Canceling uploads...');
                cancelAllRequests();
            };

            me.pause = function (force) {
                l.d('pausing FileUpload ', me.id);
                me.info('Pausing uploads...');
                if (force) {
                    l.d('Pausing requests to force abort parts that are evaporating');
                    abortParts();
                    setStatus(PAUSED);
                    me.paused();
                } else {
                    setStatus(PAUSING);
                    me.pausing();
                }
            };

            me.resume = function () {
                if ([PAUSING, PAUSED].indexOf(me.status) > -1) {
                    l.d('resuming FileUpload ', me.id);
                    setStatus(PENDING);
                    me.resumed();
                }
            };

            function removePartFromProcessing(partIdx) {
                if (removeAtIndex(partsInProcess, partIdx)) {
                    evaporatingCnt(-1);
                }
            }

            function retirePartFromProcessing(part) {
                removeAtIndex(partsToUpload, part.part);
                removePartFromProcessing(part.part);
                if (partsInProcess.length === 0 && me.status === PAUSING) {
                    me.status = PAUSED;
                    me.paused();
                }
            }

            function removeAtIndex(a, i) {
                var idx = a.indexOf(i);
                if (idx > -1) {
                    a.splice(idx, 1);
                    return true;
                }
            }

            function setStatus(s) {
                if ([COMPLETE, ERROR, CANCELED, ABORTED, PAUSED].indexOf(s) > -1) {
                    stopMonitorProgress();
                }
                me.status = s;
                me.onStatusChange();
            }

            function abortParts() {
                partsInProcess.forEach(function (i) {
                    if (s3Parts[i].awsRequest) {
                        s3Parts[i].awsRequest.abort();
                    }
                });
                monitorTotalProgress();
            }

            function cancelAllRequests() {
                l.d('cancelAllRequests()');

                if(typeof me.uploadId === 'undefined') {
                    setStatus(ABORTED);
                    me.cancelled();
                    return;
                }

                new DeleteMultipartUpload().send();
            }

            function startFileProcessing() {
                monitorProgress();
                processPartsToUpload();
            }

            function defer() {
                var deferred = {}, promise;
                promise = new Promise(function(resolve, reject){
                    deferred = {resolve: resolve, reject: reject};
                });
                return {
                    resolve: deferred.resolve,
                    reject: deferred.reject,
                    promise: promise
                }
            }


            function SignedS3AWSRequest(request) {
                this.request = request;
                this.attempts = 1;

                this.signer = con.awsSignatureVersion === '2' ? new AwsSignatureV2(request) : new AwsSignatureV4(request, this.getPayload());
            }
            SignedS3AWSRequest.prototype.success = function () {};
            SignedS3AWSRequest.prototype.error =  function (reason) {
                if (this.errorExceptionStatus()) {
                    return;
                }

                l.d(this.request.step, ' error ', me.id);

                if (typeof this.errorHandler(reason) !== 'undefined' ) {
                    return;
                }

                me.warn('Error in ', this.request.step, reason);
                setStatus(ERROR);

                var self = this,
                    backOffWait = (this.attempts === 1) ? 0 : 1000 * Math.min(
                      con.maxRetryBackoffSecs,
                      Math.pow(con.retryBackoffPower, this.attempts - 2)
                  );
                this.attempts += 1;

                setTimeout(function () {
                    if (!self.errorExceptionStatus()) { self.send(); }
                }, backOffWait);
            };
            SignedS3AWSRequest.prototype.errorHandler = function () { };
            SignedS3AWSRequest.prototype.errorExceptionStatus = function () { return false; };
            SignedS3AWSRequest.prototype.getPayload = function () { return null; };
            SignedS3AWSRequest.prototype.success_status = function (xhr) {
                return (xhr.status >= 200 && xhr.status <= 299) ||
                    this.request.success404 && xhr.status === 404;
            };
            SignedS3AWSRequest.prototype.stringToSign = function () {
                return encodeURIComponent(this.signer.stringToSign());
            };
            SignedS3AWSRequest.prototype.makeSignParamsObject = function (params) {
              var out = {};
              for (var param in params) {
                if (!params.hasOwnProperty(param)) { continue; }
                if (typeof params[param] === 'function') {
                  out[param] = params[param]();
                } else {
                  out[param] = params[param];
                }
              }
              return out;
            };
            SignedS3AWSRequest.prototype.authorizedSignWithLambda = function () {
                var self = this;
                return new Promise(function(resolve, reject) {
                    con.awsLambda.invoke({
                        FunctionName: con.awsLambdaFunction,
                        InvocationType: 'RequestResponse',
                        Payload: JSON.stringify({
                            to_sign: self.signer.stringToSign(),
                            sign_params: self.makeSignParamsObject(me.signParams),
                            sign_headers: self.makeSignParamsObject(con.signHeaders)
                        })
                    }, function (err, data) {
                        if (err) {
                            var warnMsg = 'failed to get authorization with lambda ' + err;
                            l.w(warnMsg);
                            me.warn(warnMsg);
                            return reject(warnMsg);
                        }
                        resolve(self.signResponse(JSON.parse(data.Payload)));
                    });
                });
            };
            SignedS3AWSRequest.prototype.signResponse = function(payload, stringToSign, signatureDateTime) {
                if (typeof con.signResponseHandler === 'function') {
                    payload = con.signResponseHandler(payload, stringToSign, signatureDateTime) || payload;
                }

                return payload;
            };
            SignedS3AWSRequest.prototype.sendRequestToAWS = function () {
                var self = this;
                return new Promise( function (resolve, reject) {

                    var xhr = new XMLHttpRequest();
                    self.currentXhr = xhr;

                    var payload = self.getPayload(),
                        url = AWS_URL + self.request.path,
                        all_headers = {};

                    if (self.request.query_string) {
                        url += self.request.query_string;
                    }
                    extend(all_headers, self.request.not_signed_headers);
                    extend(all_headers, self.request.x_amz_headers);

                    if (con.simulateErrors && self.request.attempts === 1 && self.request.step === 'upload #3') {
                        l.d('simulating error by POST part #3 to invalid url');
                        url = 'https:///foo';
                    }

                    xhr.open(self.request.method, url);
                    xhr.setRequestHeader('Authorization', self.signer.authorizationString());

                    for (var key in all_headers) {
                        if (all_headers.hasOwnProperty(key)) {
                            xhr.setRequestHeader(key, all_headers[key]);
                        }
                    }

                    if (con.awsSignatureVersion === '4') {
                        xhr.setRequestHeader("x-amz-content-sha256", self.signer.getPayloadSha256Content());
                    }

                    if (self.request.contentType) {
                        xhr.setRequestHeader('Content-Type', self.request.contentType);
                    }

                    if (self.request.md5_digest) {
                        xhr.setRequestHeader('Content-MD5', self.request.md5_digest);
                    }
                    xhr.onreadystatechange = function () {
                        if (xhr.readyState === 4) {

                            if (payload) {
                                // Test, per http://code.google.com/p/chromium/issues/detail?id=167111#c20
                                // Need to refer to the payload to keep it from being GC'd...sad.
                                l.d('  ###', payload.size);
                            }
                            if (self.success_status(xhr)) {
                                if (self.request.response_match &&
                                    xhr.response.match(new RegExp(self.request.response_match)) === undefined) {
                                    reject('AWS response does not match set pattern: ' + self.request.response_match);
                                } else {
                                    resolve(xhr);
                                }
                            } else {
                                var reason = xhr.responseText ? getAwsResponse(xhr) : 'status:' + xhr.status;
                                reject(reason);
                            }
                        }
                    };

                    xhr.onerror = function (xhr) {
                        var reason = xhr.responseText ? getAwsResponse(xhr) : 'transport error';
                        reject(reason);
                    };

                    if (typeof self.request.onProgress === 'function') {
                        xhr.upload.onprogress = function (evt) {
                            self.request.onProgress(evt);
                        };
                    }

                    xhr.send(payload);
                });
            };
            //see: http://docs.amazonwebservices.com/AmazonS3/latest/dev/RESTAuthentication.html#ConstructingTheAuthenticationHeader
            SignedS3AWSRequest.prototype.getAuthorization = function () {
                var self = this;
                return new Promise(function (resolve, reject) {

                    l.d('authorizedSend()', self.request.step);

                    var result,
                        xhr = new XMLHttpRequest();
                    self.currentXhr = xhr;


                    if (con.awsLambda) {
                        self.authorizedSignWithLambda()
                            .then(function (signature) {
                                resolve(signature);
                            }, function (reason) {
                                reject(reason)
                            })
                        return;
                    }

                    var stringToSign = self.stringToSign(),
                        url = [con.signerUrl, '?to_sign=', stringToSign, '&datetime=', self.request.dateString].join('');

                    if (typeof con.signerUrl === 'undefined') {
                        result = self.signResponse(null, stringToSign, self.request.dateString);
                        return result ? resolve(result) : reject('signResponse returned no signature.')
                    }

                    var signParams = self.makeSignParamsObject(me.signParams);
                    for (var param in signParams) {
                        if (!signParams.hasOwnProperty(param)) { continue; }
                        url += ('&' + encodeURIComponent(param) + '=' + encodeURIComponent(signParams[param]));
                    }

                    if (con.xhrWithCredentials) {
                        xhr.withCredentials = true;
                    }

                    xhr.onreadystatechange = function () {
                        if (xhr.readyState === 4) {

                            if (xhr.status === 200) {
                                var payload = self.signResponse(xhr.response);

                                if (con.awsSignatureVersion === '2' &&  payload.length !== 28) {
                                    reject("V2 signature length !== 28");
                                } else {
                                    l.d('authorizedSend got signature for:', self.request.step, '- signature:', payload);
                                    return resolve(payload);
                                }
                            } else {
                                reject("Signature fetch returned status: " + xhr.status);
                            }
                        }
                    };

                    xhr.onerror = function (xhr) {
                        reject('authorizedSend transport error: ' + xhr.responseText);
                    };

                    xhr.open('GET', url);
                    var signHeaders = self.makeSignParamsObject(con.signHeaders);
                    for (var header in signHeaders) {
                        if (!signHeaders.hasOwnProperty(header)) { continue; }
                        xhr.setRequestHeader(header, signHeaders[header])
                    }

                    if (typeof me.beforeSigner  === 'function') {
                        me.beforeSigner(xhr, url);
                    }
                    xhr.send();
                });
            };
            SignedS3AWSRequest.prototype.sendAuthorizedRequest = function () {
                l.d('setupRequest()', this.request);

                var datetime = con.timeUrl ? new Date(new Date().getTime() + localTimeOffset) : new Date();
                if (con.awsSignatureVersion === '4') {
                    this.request.dateString = datetime.toISOString().slice(0, 19).replace(/-|:/g, '') + "Z";
                } else {
                    this.request.dateString = datetime.toUTCString();
                }

                this.request.x_amz_headers = extend(this.request.x_amz_headers, {
                    'x-amz-date': this.request.dateString
                });

                return this.getAuthorization();
            };
            SignedS3AWSRequest.prototype.authorizationSuccess = function (authorization) {
                l.d('authorizedSend got signature for:', this.request.step, '- signature:', authorization);
                this.request.auth = authorization;
            };
            SignedS3AWSRequest.prototype.send = function () {
                return this.sendAuthorizedRequest()
                    .then(this.authorizationSuccess.bind(this))
                    .then(this.sendRequestToAWS.bind(this))
                    .then(this.success.bind(this), this.error.bind(this))
            };

            function CancelableS3AWSRequest(request) {
                SignedS3AWSRequest.call(this, request);
            }
            CancelableS3AWSRequest.prototype = Object.create(SignedS3AWSRequest.prototype);
            CancelableS3AWSRequest.prototype.constructor = CancelableS3AWSRequest;
            CancelableS3AWSRequest.prototype.errorExceptionStatus = function () {
                return [ABORTED, CANCELED].indexOf(me.status) < -1;
            };

            function SignedS3AWSRequestWithRetryLimit(request, maxRetries) {
                if (maxRetries > -1) {
                    this.maxRetries = maxRetries;
                }
                SignedS3AWSRequest.call(this, request);
            }
            SignedS3AWSRequestWithRetryLimit.prototype = Object.create(CancelableS3AWSRequest.prototype);
            SignedS3AWSRequestWithRetryLimit.prototype.constructor = SignedS3AWSRequestWithRetryLimit;
            SignedS3AWSRequestWithRetryLimit.prototype.maxRetries = 1;
            SignedS3AWSRequestWithRetryLimit.prototype.errorHandler =  function (reason) {
                if (this.attempts > this.maxRetries) {
                    var msg = ['MaxRetries exceeded. Will re-upload file id ', me.id, ', ', reason];
                    l.w(msg.join(""));
                    return new InitiateMultipartUpload(this.awsKey).send();
                }
            };

            // see: http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadInitiate.html
            function InitiateMultipartUpload(awsKey) {
                var request = {
                    method: 'POST',
                    path: getPath() + '?uploads',
                    step: 'initiate',
                    x_amz_headers: me.xAmzHeadersAtInitiate,
                    not_signed_headers: me.notSignedHeadersAtInitiate,
                    response_match: '<UploadId>(.+)<\/UploadId>'
                };

                if (me.contentType) {
                    request.contentType = me.contentType;
                }

                CancelableS3AWSRequest.call(this, request);
                this.awsKey = awsKey;
            }
            InitiateMultipartUpload.prototype = Object.create(CancelableS3AWSRequest.prototype);
            InitiateMultipartUpload.prototype.constructor = InitiateMultipartUpload;
            InitiateMultipartUpload.prototype.success = function (xhr) {
                var match = xhr.response.match(new RegExp(this.request.response_match));
                me.uploadId = match[1];
                me.awsKey = this.awsKey;
                l.d('requester success. got uploadId', me.uploadId);
                createUploadFile();
                partsToUpload = [];
                makeParts();
            };

            //http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadComplete.html
            function CompleteMultipartUpload() {
                l.d('completeUpload');
                me.info('will attempt to complete upload');
                stopMonitorProgress();

                var request = {
                    method: 'POST',
                    contentType: 'application/xml; charset=UTF-8',
                    path: getPath() + '?uploadId=' + me.uploadId,
                    x_amz_headers: me.xAmzHeadersCommon || me.xAmzHeadersAtComplete,
                    step: 'complete'
                };

                CancelableS3AWSRequest.call(this, request);
            }
            CompleteMultipartUpload.prototype = Object.create(CancelableS3AWSRequest.prototype);
            CompleteMultipartUpload.prototype.constructor = CompleteMultipartUpload;
            CompleteMultipartUpload.prototype.success = function (xhr) {
                var oDOM = parseXml(xhr.responseText),
                    result = oDOM.getElementsByTagName("CompleteMultipartUploadResult")[0];
                me.eTag = nodeValue(result, "ETag");
                me.complete(xhr, me.name);
                completeUploadFile();
            };
            CompleteMultipartUpload.prototype.getPayload = function () {
                var completeDoc = [];

                completeDoc.push('<CompleteMultipartUpload>');
                s3Parts.forEach(function (part, partNumber) {
                    if (partNumber > 0) {
                        completeDoc.push(['<Part><PartNumber>', partNumber, '</PartNumber><ETag>', part.eTag, '</ETag></Part>'].join(""));
                    }
                });
                completeDoc.push('</CompleteMultipartUpload>');

                return completeDoc.join("");
            };

            //http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadComplete.html
            function ReuseS3Object(awsKey) {
                this.awsKey = awsKey;
                l.d('headObject');
                me.info('will attempt to verify existence of the file');

                var request = {
                        method: 'HEAD',
                        path: getPath(),
                        x_amz_headers: me.xAmzHeadersCommon,
                        success404: true,
                        step: 'head_object'
                    };

                SignedS3AWSRequestWithRetryLimit.call(this, request);

                if (con.allowS3ExistenceOptimization && me.firstMd5Digest === s3Parts[1].md5_digest) {
                    return this;
                } else {
                    return new InitiateMultipartUpload(awsKey);
                }
            }
            ReuseS3Object.prototype = Object.create(SignedS3AWSRequestWithRetryLimit.prototype);
            ReuseS3Object.prototype.constructor = ReuseS3Object;
            ReuseS3Object.prototype.awsKey = undefined;
            ReuseS3Object.prototype.success = function (xhr) {
                var eTag = xhr.getResponseHeader('Etag');
                if (eTag === me.eTag) {
                    l.d('headObject found matching object on S3.');
                    me.progress(1.0);
                    me.complete(xhr, me.name);
                    setStatus(COMPLETE);
                } else {
                    l.d('headObject not found on S3.');
                    return new InitiateMultipartUpload(this.awsKey).send();
                }
            };

            //http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadListParts.html
            function GetMultipartUploadParts() {
                SignedS3AWSRequestWithRetryLimit.call(this, this.setupRequest(0));
            }
            GetMultipartUploadParts.prototype = Object.create(SignedS3AWSRequestWithRetryLimit.prototype);
            GetMultipartUploadParts.prototype.constructor = GetMultipartUploadParts;
            GetMultipartUploadParts.prototype.awsKey = undefined;
            GetMultipartUploadParts.prototype.partNumberMarker = 0;
            GetMultipartUploadParts.prototype.setupRequest = function (partNumberMarker) {
                var msg = ['getUploadParts() for uploadId starting at part #', partNumberMarker].join(" ");
                l.d(msg);
                me.info(msg);

                this.awsKey = me.name;
                this.partNumberMarker = partNumberMarker;
                var request = {
                    method: 'GET',
                    path: getPath() + '?uploadId=' + me.uploadId,
                    query_string: "&part-number-marker=" + partNumberMarker,
                    x_amz_headers: me.xAmzHeadersCommon,
                    step: 'get upload parts',
                    success404: true
                };

                if (con.awsSignatureVersion === '4') {
                    request.path = [getPath(), '?uploadId=', me.uploadId, "&part-number-marker=" + partNumberMarker].join("");
                }

                this.request = request;
                return request;
            };
            GetMultipartUploadParts.prototype.success = function (xhr) {
                if (xhr.status === 404) {
                    // Success! Upload is no longer recognized, so there is nothing to fetch
                    me.info(['uploadId ', me.uploadId, ' does not exist.'].join(''));
                    removeUploadFile();
                    return new InitiateMultipartUpload(this.awsKey).send();
                }
                me.info('uploadId', me.uploadId, 'is not complete. Fetching parts from part marker', this.partNumberMarker);
                var oDOM = parseXml(xhr.responseText),
                    listPartsResult = oDOM.getElementsByTagName("ListPartsResult")[0],
                    isTruncated = nodeValue(listPartsResult, "IsTruncated") === 'true',
                    uploadedParts = oDOM.getElementsByTagName("Part"),
                    parts_len = uploadedParts.length,
                    cp, partSize;

                for (var i = 0; i < parts_len; i++) {
                    cp = uploadedParts[i];
                    partSize = parseInt(nodeValue(cp, "Size"), 10);
                    fileTotalBytesUploaded += partSize;
                    partsOnS3.push({
                        eTag: nodeValue(cp, "ETag"),
                        partNumber: parseInt(nodeValue(cp, "PartNumber"), 10),
                        size: partSize,
                        LastModified: nodeValue(cp, "LastModified")
                    });
                }

                if (isTruncated) {
                    this.setupRequest(nodeValue(listPartsResult, "NextPartNumberMarker")); // let's fetch the next set of parts
                    this.send();
                } else {
                    partsOnS3.forEach(function (cp) {
                        var uploadedPart = makePart(cp.partNumber, COMPLETE, cp.size);
                        uploadedPart.eTag = cp.eTag;
                        uploadedPart.loadedBytes = cp.size;
                        uploadedPart.loadedBytesPrevious = cp.size;
                        uploadedPart.finishedUploadingAt = cp.LastModified;
                    });
                    makeParts();
                }
                listPartsResult = null;  // We don't need these potentially large object any longer
            };

            function PutPart(part) {
                this.part = part;

                this.partNumber = part.part;
                this.start = (this.partNumber - 1) * con.partSize;
                this.end = this.partNumber * con.partSize;

                var self = this;

                var request = {
                    method: 'PUT',
                    path: getPath() + '?partNumber=' + this.partNumber + '&uploadId=' + me.uploadId,
                    step: 'upload #' + this.partNumber,
                    x_amz_headers: me.xAmzHeadersCommon || me.xAmzHeadersAtUpload,
                    contentSha256: "UNSIGNED-PAYLOAD",
                    onProgress: function (evt) {
                        self.part.loadedBytes = evt.loaded;
                    }
                };

                SignedS3AWSRequest.call(this, request);
            }
            PutPart.prototype = Object.create(SignedS3AWSRequest.prototype);
            PutPart.prototype.constructor = PutPart;
            PutPart.prototype.part = 1;
            PutPart.prototype.start = 0;
            PutPart.prototype.end = 0;
            PutPart.prototype.partNumber = undefined;
            PutPart.prototype.getPartMd5Digest = function () {
                var self = this,
                    part = this.part,
                    reader = new FileReader();
                return new Promise(function (resolve) {
                    if (con.computeContentMd5 && !part.md5_digest) {
                        reader.onloadend = function () {
                            var md5_digest = con.cryptoMd5Method.call(this, this.result);
                            reader = undefined;
                            if (self.partNumber === 1 && con.computeContentMd5 && typeof me.firstMd5Digest === "undefined") {
                                updateUploadFile({firstMd5Digest: md5_digest})
                            }
                            resolve(md5_digest);
                        };

                        reader.readAsArrayBuffer(getFilePart(me.file, self.start, self.end));
                    } else {
                        resolve(part.md5_digest);
                    }
                })
                    .then(function (md5_digest) {
                        if (md5_digest) {
                            l.d(self.request.step, 'MD5 digest is', md5_digest, 'status', self.part.status);
                            self.request.md5_digest = md5_digest;
                            self.part.md5_digest = md5_digest;
                        }
                    });
            };
            PutPart.prototype.dispatch = function () {
                if (this.part.status !== COMPLETE &&
                    [ABORTED, PAUSED, CANCELED].indexOf(me.status) === -1 &&
                    partsInProcess.indexOf(this.partNumber) === -1) {

                    l.d('uploadPart #', this.partNumber, this.attempts === 1 ? 'submitting' : 'retrying');

                    this.part.status = EVAPORATING;
                    this.attempts += 1;
                    this.part.loadedBytesPrevious = null;

                    if (partsInProcess.indexOf(this.partNumber) === -1) {
                        partsInProcess.push(this.partNumber);
                        evaporatingCnt(+1);
                    }

                    l.d('upload #', this.partNumber, this.request);

                    var self = this;
                    return this.getPartMd5Digest()
                        .then(function () {
                            self.send();
                            processPartsToUpload();
                        });
                }

            };
            PutPart.prototype.success = function (xhr) {
                var eTag = xhr.getResponseHeader('ETag'), msg;

                l.d('uploadPart 200 response for part #', this.partNumber, 'ETag:', eTag);
                if (this.part.isEmpty || (eTag !== ETAG_OF_0_LENGTH_BLOB)) { // issue #58
                    this.part.eTag = eTag;
                    this.part.status = COMPLETE;

                    partsOnS3.push(this.part);
                    fileTotalBytesUploaded += this.part.loadedBytes;
                    this.part.deferred.resolve();
                    retirePartFromProcessing(this.part);
                } else {
                    this.part.status = ERROR;
                    this.part.loadedBytes = 0;
                    msg = ['eTag matches MD5 of 0 length blob for part #', this.partNumber, 'Retrying part.'].join(" ");
                    l.w(msg);
                    me.warn(msg);
                    removePartFromProcessing(this.partNumber)
                }
                processPartsToUpload();
            };
            PutPart.prototype.error =  function (reason) {
                this.part.loadedBytes = 0;

                this.part.status = ERROR;

                if ([CANCELED, ABORTED, PAUSED, PAUSING].indexOf(me.status) > -1) {
                    return;
                }
                if (reason === 'status:404') {
                    retirePartFromProcessing(this.part);

                    var errMsg = '404 error on part PUT. The part and the file will abort.';
                    l.w(errMsg);
                    me.error(errMsg);
                    this.part.status = ABORTED;
                    this.part.deferred.reject();
                    new DeleteMultipartUpload().send();
                } else {
                    var msg = 'problem uploading part #' + this.partNumber + ',  reason: ' + reason;

                    l.w(msg);
                    me.warn(msg);

                    removePartFromProcessing(this.partNumber);
                    processPartsToUpload();
                }
            };
            PutPart.prototype.abort = function () {
                if (this.currentXhr) {
                    this.currentXhr.abort();
                    this.part.loadedBytes = 0;
                }
            };
            PutPart.prototype.getPayload = function () {
                var slice = getFilePart(me.file, this.start, this.end);
                l.d('part #', this.partNumber, '( bytes', this.start, '->', this.end, ')  reported length:', slice.size);
                if (!this.part.isEmpty && slice.size === 0) { // issue #58
                    l.w('  *** WARN: blob reporting size of 0 bytes. Will try upload anyway..');
                }
                return slice;
            };

            //http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadAbort.html
            function DeleteMultipartUpload() {
                l.d('abortUpload');
                me.info('will attempt to abort the upload');

                abortParts();

                var request = {
                        method: 'DELETE',
                        path: getPath() + '?uploadId=' + me.uploadId,
                        x_amz_headers: me.xAmzHeadersCommon,
                        success404: true,
                        step: 'abort'
                    };

                SignedS3AWSRequest.call(this, request);
            }
            DeleteMultipartUpload.prototype = Object.create(SignedS3AWSRequest.prototype);
            DeleteMultipartUpload.prototype.constructor = DeleteMultipartUpload;
            DeleteMultipartUpload.prototype.maxRetries = 1;
            DeleteMultipartUpload.prototype.success = function () {
                setStatus(ABORTED);
                new VerifyPartsAborted().send();
            };
            DeleteMultipartUpload.prototype.errorHandler =  function (reason) {
                if (this.attempts > this.maxRetries) {
                    var msg = 'Error aborting upload: ' + reason;
                    l.w(msg);
                    me.error(msg);
                    return true;
                }
            };

            // http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadListParts.html
            function VerifyPartsAborted() {
                l.d('listParts');
                me.info('list parts');

                this.awsKey = me.name;

                var request = {
                        method: 'GET',
                        path: getPath() + '?uploadId=' + me.uploadId,
                        x_amz_headers: me.xAmzHeadersCommon,
                        step: 'list',
                        success404: true
                    };

                SignedS3AWSRequest.call(this, request);
            }
            VerifyPartsAborted.prototype = Object.create(SignedS3AWSRequest.prototype);
            VerifyPartsAborted.prototype.constructor = VerifyPartsAborted;
            VerifyPartsAborted.prototype.maxRetries = 1;
            VerifyPartsAborted.prototype.awsKey = undefined;
            VerifyPartsAborted.prototype.success = function (xhr) {
                if (xhr.status === 404) {
                    // Success! Parts are not found because the uploadid has been cleared
                    removeUploadFile();
                } else {
                    var oDOM = parseXml(xhr.responseText);
                    var domParts = oDOM.getElementsByTagName("Part");
                    if (domParts.length) { // Some parts are still uploading
                        l.d('Parts still found after abort...waiting.');
                        setTimeout(new DeleteMultipartUpload().send(), con.abortCompletionThrottlingMs);
                        return;
                    }
                }
                fileTotalBytesUploaded = 0;
                me.info('upload canceled');
                evaporatingCount = 0;
                con.evaporateChanged(me, evaporatingCount);
                me.cancelled();
            };
            VerifyPartsAborted.prototype.errorHandler =  function (reason) {
                if (this.attempts > this.maxRetries) {
                    var msg = 'Error listing parts. ' + reason;
                    l.w(msg);
                    me.error(msg);
                    evaporatingCount = 0;
                    con.evaporateChanged(me, evaporatingCount);
                    me.cancelled();
                    return true;
                }
            };

            var numParts = -1;

            function makeParts() {
                numParts = Math.ceil(me.file.size / con.partSize) || 1; // issue #58
                partsDeferredPromises = [];

                for (var part = 1; part <= numParts; part++) {
                    var s3Part = s3Parts[part];
                    if (typeof s3Part !== "undefined"){
                        if(s3Part.status === COMPLETE) { continue; }
                    } else {
                        makePart(part, PENDING, me.file.size);
                    }

                    partsToUpload.push(part);
                    partsDeferredPromises.push(s3Parts[part].deferred.promise);
                }

                partsPromise = Promise.all(partsDeferredPromises)
                    .then(function () {
                        return new CompleteMultipartUpload().send();
                    },
                    function () { });

                setStatus(EVAPORATING);
                startFileProcessing();
                return partsPromise;
            }

            function makePart(partNumber, status, size) {
                var part = {
                    status: status,
                    loadedBytes: 0,
                    loadedBytesPrevious: null,
                    isEmpty: (size === 0), // issue #58
                    md5_digest: null,
                    part: partNumber
                };

                if (status !== COMPLETE) {
                    part.awsRequest = new PutPart(part);
                    part.deferred = defer();
                }

                s3Parts[partNumber] = part;

                return part;
            }

            function createUploadFile() {
                var fileKey = uploadKey(me),
                    newUpload = {
                        awsKey: me.name,
                        bucket: con.bucket,
                        uploadId: me.uploadId,
                        fileSize: me.file.size,
                        fileType: me.file.type,
                        lastModifiedDate: dateISOString(me.file.lastModifiedDate),
                        partSize: con.partSize,
                        signParams: con.signParams,
                        createdAt: new Date().toISOString()
                    };
                saveUpload(fileKey, newUpload);
            }

            function updateUploadFile(updates) {
                var fileKey = uploadKey(me);
                var uploads = getSavedUploads();
                var upload = Object.assign({}, uploads[fileKey], updates);
                saveUpload(fileKey, upload);
            }

            function completeUploadFile() {
                var uploads = getSavedUploads(),
                    upload = uploads[uploadKey(me)];

                if (typeof upload !== 'undefined') {
                    upload.completedAt = new Date().toISOString();
                    upload.eTag = me.eTag;
                    historyCache.setItem('awsUploads', JSON.stringify(uploads));
                }

                setStatus(COMPLETE);
                me.progress(1.0);

            }

            function removeUploadFile() {
                if (typeof me.file !== 'undefined') {
                    removeUpload(uploadKey(me));
                }
            }

            function getUnfinishedFileUpload() {
                var savedUploads = getSavedUploads(true),
                    u = savedUploads[uploadKey(me)];

                if (canRetryUpload(u)) {
                    me.uploadId = u.uploadId;
                    me.name = u.awsKey;
                    me.eTag = u.eTag;
                    me.firstMd5Digest = u.firstMd5Digest;
                    me.signParams = u.signParams;
                }
            }

            function canRetryUpload(u) {
                // Must be the same file name, file size, last_modified, file type as previous upload
                if (typeof u === 'undefined') {
                    return false;
                }
                var completedAt = new Date(u.completedAt || FAR_FUTURE);

                // check that the part sizes and bucket match, and if the file name of the upload
                // matches if onlyRetryForSameFileName is true
                return con.partSize === u.partSize &&
                    completedAt > HOURS_AGO &&
                    con.bucket === u.bucket &&
                    (con.onlyRetryForSameFileName ? me.name === u.awsKey : true);
            }

            function processPartsToUpload() {
                var stati = [], bytesLoaded = [],
                    limit = con.maxConcurrentParts - evaporatingCount;

                if (limit === 0) {
                    return;
                }
                if (me.status !== EVAPORATING) {
                    me.info('will not process parts list, as not currently evaporating');
                    return;
                }

                for (var i = 0; i < partsToUpload.length; i++) {
                    var part = s3Parts[partsToUpload[i]];
                    stati.push(part.status);
                    if (part.status === EVAPORATING) {
                        bytesLoaded.push(part.loadedBytes);
                    } else {
                        if (evaporatingCount < con.maxConcurrentParts && partsInProcess.indexOf(part.part) === -1) {
                            return part.awsRequest.dispatch();
                        }
                        limit -= 1;
                        if (limit === 0) {
                            break;
                        }
                    }
                }

                if (!bytesLoaded.length) {
                    // we're probably offline or in a very bad state
                    l.w('processPartsList() No bytes loaded for any parts. We may be offline.');
                    if (partsMonitorInterval === PARTS_MONITOR_INTERVALS.online) {
                        partsMonitorInterval = PARTS_MONITOR_INTERVALS.offline;
                    }
                } else if (partsMonitorInterval === PARTS_MONITOR_INTERVALS.offline) {
                    l.d('processPartsList() Back online.');
                    partsMonitorInterval = PARTS_MONITOR_INTERVALS.online;
                }

                var info = stati.toString() + ' // bytesLoaded: ' + bytesLoaded.toString();
                l.d('processPartsList(): ', info);

                if (countUploadAttempts >= numParts) {
                    me.info('part stati:', info);
                }
            }


            function monitorTotalProgress() {

                clearInterval(progressTotalInterval);
                progressTotalInterval = setInterval(function () {

                    var totalBytesLoaded = fileTotalBytesUploaded;
                    partsInProcess.forEach(function (i) {
                        totalBytesLoaded += s3Parts[i].loadedBytes;
                    });

                    me.progress(totalBytesLoaded / me.sizeBytes);
                }, con.progressIntervalMS);
            }


            /*
             Issue #6 identified that some parts would stall silently.
             The issue was only noted on Safari on OSX. A bug was filed with Apple, #16136393
             This function was added as a work-around. It checks the progress of each part every 2 minutes.
             If it finds a part that has made no progress in the last 2 minutes then it aborts it. It will then be detected as an error, and restarted in the same manner of any other errored part
             */
            function monitorPartsProgress() {

                clearInterval(progressPartsInterval);
                progressPartsInterval = setInterval(function () {

                    l.d('monitorPartsProgress()');
                    partsInProcess.forEach(function (partIdx) {

                        var part = s3Parts[partIdx],
                            healthy;

                        if (part.loadedBytesPrevious === null) {
                            part.loadedBytesPrevious = part.loadedBytes;
                            return;
                        }

                        healthy = part.loadedBytesPrevious < part.loadedBytes;
                        if (con.simulateStalling && partIdx === 4) {
                            if (Math.random() < 0.25) {
                                healthy = false;
                            }
                        }

                        l.d(partIdx, (healthy ? 'moving.' : 'stalled.'), part.loadedBytesPrevious, part.loadedBytes);

                        if (!healthy) {
                            setTimeout(function () {
                                me.info('part #' + partIdx, ' stalled. will abort.', part.loadedBytesPrevious, part.loadedBytes);
                                s3Parts[partIdx].awsRequest.abort();
                                part.status = PENDING;
                                removePartFromProcessing(partIdx);
                                processPartsToUpload();
                            }, 0);
                        }

                        part.loadedBytesPrevious = part.loadedBytes;
                    });
                }, partsMonitorInterval);
            }

            function monitorProgress() {
                monitorTotalProgress();
                monitorPartsProgress();
            }

            function stopMonitorProgress() {
                clearInterval(progressTotalInterval);
                clearInterval(progressPartsInterval);
            }

            function getPath() {
                var path = '/' + con.bucket + '/' + me.name;
                if (con.cloudfront || AWS_URL.indexOf('cloudfront') > -1) {
                    path = '/' + me.name;
                }
                return path;
            }
        }

        function AwsSignature(request) {
            this.request = request;
        }
        AwsSignature.prototype.request = {};
        AwsSignature.prototype.authorizationString = function () {};
        AwsSignature.prototype.stringToSign = function () {};

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

            var self = this;
            header_key_array.forEach(function (header_key) {
                x_amz_headers += (header_key + ':' + self.request.x_amz_headers[header_key] + '\n');
            });

            result = this.request.method + '\n' +
                (this.request.md5_digest || '') + '\n' +
                (this.request.contentType || '') + '\n' +
                '\n' +
                x_amz_headers +
                (con.cloudfront ? '/' + con.bucket : '') +
                this.request.path;

            l.d('makeStringToSign (V2)', result);
            return result;

        };

        function AwsSignatureV4(request, payload) {
            this.payload = payload;
            AwsSignature.call(this, request);
        }
        AwsSignatureV4.prototype = Object.create(AwsSignature.prototype);
        AwsSignatureV4.prototype.constructor = AwsSignatureV4;
        AwsSignatureV4.prototype.payload = null;
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

            l.d('makeStringToSign (V4)', result);
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
            var search = uri(this.request.path).search,
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
          l.d('getPayloadSha256Content', result);
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

              addHeader('Host', AWS_HOST);

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
            var canonParts = [];

            canonParts.push(this.request.method);
            canonParts.push(uri(this.request.path).pathname);
            canonParts.push(this.canonicalQueryString() || '');

            var headers = this.canonicalHeaders();
            canonParts.push(headers.canonicalHeaders + '\n');
            canonParts.push(headers.signedHeaders);
            canonParts.push(this.getPayloadSha256Content());

            var result = canonParts.join("\n");
            l.d('CanonicalRequest (V4)', result);
            return result;
        };

        function extend(obj1, obj2, obj3) {
            function ext(target, source) {
                if (typeof source !== 'object') { return; }
                for (var key in source) {
                    if (source.hasOwnProperty(key)) {
                        target[key] = source[key];
                    }
                }
            }

            obj1 = obj1 || {};
            ext(obj2, obj3);
            ext(obj1, obj2);

            return obj1;
        }

        function parseXml(body) {
            var parser = new DOMParser();
            return parser.parseFromString(body, "text/xml");
        }

        function getSavedUploads(purge) {
            var uploads = JSON.parse(historyCache.getItem('awsUploads') || '{}');

            if (purge) {
                for (var key in uploads) {
                    if (uploads.hasOwnProperty(key)) {
                        var upload = uploads[key],
                            completedAt = new Date(upload.completedAt || FAR_FUTURE);

                        if (completedAt < HOURS_AGO) {
                            // The upload is recent, let's keep it
                            delete uploads[key];
                        }
                    }
                }

                historyCache.setItem('awsUploads', JSON.stringify(uploads));
            }

            return uploads;
        }

        function uploadKey(fileUpload) {
            // The key tries to give a signature to a file in the absence of its path.
            // "<filename>-<mimetype>-<modifieddate>-<filesize>"
            return [
                fileUpload.file.name,
                fileUpload.file.type,
                dateISOString(fileUpload.file.lastModifiedDate),
                fileUpload.file.size
            ].join("-");
        }

        function saveUpload(uploadKey, upload) {
            var uploads = getSavedUploads();
            uploads[uploadKey] = upload;
            historyCache.setItem('awsUploads', JSON.stringify(uploads));
        }

        function removeUpload(uploadKey) {
            var uploads = getSavedUploads();
            delete uploads[uploadKey];
            historyCache.setItem('awsUploads', JSON.stringify(uploads));
        }

        function nodeValue(parent, nodeName) {
            return parent.getElementsByTagName(nodeName)[0].textContent;
        }
    };

    function uri(url) {
        var p = document.createElement('a');
        p.href = url || "/";

        return {
            protocol: p.protocol, // => "http:"
            hostname: p.hostname, // => "example.com"
            // IE omits the leading slash, so add it if it's missing
            pathname: p.pathname.replace(/(^\/?)/, "/"), // => "/pathname/"
            port: p.port, // => "3000"
            search: (p.search[0] === '?') ? p.search.substr(1) : p.search, // => "search=test"
            hash: p.hash, // => "#hash"
            host: p.host  // => "example.com:3000"
        };
    }

    function dateISOString(date) {
        // Try to get the modified date as an ISO String, if the date exists
        return date ? date.toISOString() : '';
    }

    function getFilePart(file, start, end) {
        var slicerFn = (file.slice ? 'slice' : (file.mozSlice ? 'mozSlice' : 'webkitSlice'));
        // browsers' implementation of the Blob.slice function has been renamed a couple of times, and the meaning of the
        // 2nd parameter changed. For example Gecko went from slice(start,length) -> mozSlice(start, end) -> slice(start, end).
        // As of 12/12/12, it seems that the unified 'slice' is the best bet, hence it being first in the list. See
        // https://developer.mozilla.org/en-US/docs/DOM/Blob for more info.
        return file[slicerFn](start, end);
    }

    function getAwsResponse(xhr) {
        var oParser = new DOMParser(),
            oDOM = oParser.parseFromString(xhr.responseText, "text/html"),
            code = oDOM.getElementsByTagName("Code"),
            msg = oDOM.getElementsByTagName("Message");
        code = code && code.length ? (code[0].innerHTML || code[0].textContent) : '';
        msg = msg && msg.length ? (msg[0].innerHTML || msg[0].textContent) : '';

        return code.length ? ['AWS Code: ', code, ', Message:', msg].join("") : '';
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Evaporate;
    } else if (typeof window !== 'undefined') {
        window.Evaporate = Evaporate;
    }

}());
