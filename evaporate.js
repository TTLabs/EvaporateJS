/*Copyright (c) 2016, TT Labs, Inc.
 All rights reserved.

 Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

 Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

 Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

 Neither the name of the TT Labs, Inc. nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.*/


/***************************************************************************************************
 *                                                                                                  *
 *  version 1.6.3                                                                                   *
 *                                                                                                  *
 ***************************************************************************************************/

(function () {
    "use strict";

    var FAR_FUTURE = new Date('2060-10-22'),
        HOURS_AGO,
        PENDING = 0, EVAPORATING = 2, COMPLETE = 3, PAUSED = 4, CANCELED = 5, ERROR = 10, ABORTED = 20, PAUSING = 30, ETAG_OF_0_LENGTH_BLOB = '"d41d8cd98f00b204e9800998ecf8427e"',
        IMMUTABLE_OPTIONS = [
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
        ],
        PARTS_MONITOR_INTERVALS = {
            online: 2 * 60 * 1000, // 2 minutes
            offline: 20 * 1000 // 20 seconds
        },
        l;

    var Evaporate = function (config) {
        this.config = extend({
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
        this.files = [];

        if (typeof window !== 'undefined' && window.console) {
            l = window.console;
            l.d = l.log;
            l.w = window.console.warn ? l.warn : l.d;
            l.e = window.console.error ? l.error : l.d;
        }

        if (!this.validateEvaporateOptions()) {
            this.supported = false;
            return;
        }

        if (!this.config.logging) {
            // Reset the logger to be a no_op
            l = noOpLogger();
        }

        this.awsUrl = awsUrl(this.config);
        this.awsHost = uri(this.awsUrl).hostname;

        var _d = new Date();
        HOURS_AGO = new Date(_d.setHours(_d.getHours() - (this.config.s3FileCacheHoursAgo || -100)));

        var self = this;
        getLocalTimeOffset(this.config)
            .then(function (offset) {
                l.d('localTimeOffset is', offset, 'ms');
                self.localTimeOffset = offset;
                self.initialized = true;
            });
    };
    Evaporate.prototype.config = {};
    Evaporate.prototype.initialized = false;
    Evaporate.prototype.supported = false;
    Evaporate.prototype.localTimeOffset = 0;
    Evaporate.prototype.evaporatingCount = 0;
    Evaporate.prototype.awsUrl = '';
    Evaporate.prototype.files = [];
    Evaporate.prototype.startedFiles = {};
    Evaporate.prototype.partsMonitorInterval = PARTS_MONITOR_INTERVALS.online;
    Evaporate.prototype.add = function (file,  pConfig) {
        var c = extend(pConfig, {});

        IMMUTABLE_OPTIONS.map(function (a) { delete c[a]; });

        var fileConfig = extend(this.config, c);

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

        var promise = this.addFile(file, fileConfig);
        // TODO: Why does this need to be asynchronous?
        setTimeout(this.processQueue.bind(this), 1);
        return promise;
    };
    Evaporate.prototype.cancel = function (id) {
        l.d('cancel ', id);
        if (this.startedFiles[id]) {
            return this.startedFiles[id].stop();
        } else {
            return false;
        }
    };
    Evaporate.prototype.pause = function (id, options) {
        options = options || {};
        var force = options.force === 'undefined' ? false : options.force,
            typeOfId = typeof id;
        if (typeOfId === 'undefined') {
            l.d('Pausing all file uploads');
            var pausePromises = [];
            this.files.forEach(function (file) {
                if ([PENDING, EVAPORATING, ERROR].indexOf(file.status) > -1)  {
                    pausePromises.push(file.pause(force));
                }
            });
            return Promise.all(pausePromises);
        }  else if (typeof this.startedFiles[id] === 'undefined') {
            l.w('Cannot pause a file that has not been added.');
        } else if (this.startedFiles[id].status === PAUSED) {
            l.w('Cannot pause a file that is already paused. Status:', this.startedFiles[id].status);
        } else {
            return this.startedFiles[id].pause(force);
        }
    };
    Evaporate.prototype.resume = function (id) {
        var PAUSED_STATUSES = [PAUSED, PAUSING];
        if (typeof id === 'undefined') {
            l.d('Resuming all file uploads');
            this.files.forEach(function (file) {
                if (PAUSED_STATUSES.indexOf(file.status) > -1)  {
                    file.resume();
                }
            });
        }  else if (typeof this.startedFiles[id] === 'undefined') {
            l.w('Cannot pause a file that does not exist.');
        } else if (PAUSED_STATUSES.indexOf(this.startedFiles[id].status) === -1) {
            l.w('Cannot resume a file that has not been paused. Status:', this.startedFiles[id].status);
        } else {
            this.startedFiles[id].resume();
        }
    };
    Evaporate.prototype.forceRetry = function () {};
    Evaporate.prototype.addFile = function (file, fileConfig) {
        var fileKey = this.config.bucket + '/' + file.name,
            fileUpload = new FileUpload(extend({
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
                id: fileKey,
                status: PENDING,
                priority: 0,
                onStatusChange: this.processQueue.bind(this),
                loadedBytes: 0,
                sizeBytes: file.file.size,
                eTag: ''
            }), fileConfig, this);
        this.files.push(fileUpload);
        this.startedFiles[fileUpload.id] = fileUpload;
        return fileUpload.deferredCompletion.promise;
    };
    Evaporate.prototype.processQueue = function () {
        l.d('processQueue   length:', this.files.length);
        var next = -1, priorityOfNext = -1, readyForNext = true;
        this.files.forEach(function (file, i) {

            if (file.priority > priorityOfNext && file.status === PENDING) {
                next = i;
                priorityOfNext = file.priority;
            }

            if (file.status === EVAPORATING) {
                readyForNext = false;
            }
        });

        if (readyForNext && next >= 0) {
            this.files[next].start();
        }
    };
    Evaporate.prototype.signingClass = function (request, payload) {
        var SigningClass = signingVersion(this.config, l, this.awsHost);
        return new SigningClass(request, payload);
    };
    Evaporate.prototype.validateEvaporateOptions = function () {
        this.supported = !(
            typeof File === 'undefined' ||
            typeof Blob === 'undefined' ||
            typeof (
            Blob.prototype.webkitSlice ||
            Blob.prototype.mozSlice ||
            Blob.prototype.slice) === 'undefined' ||
            !!this.config.testUnsupported);

        if (!this.config.signerUrl && typeof this.config.signResponseHandler !== 'function') {
            l.e("Option signerUrl is required unless signResponseHandler is present.");
            return;
        }

        if (!this.config.bucket) {
            l.e("The AWS 'bucket' option must be present.");
            return;
        }

        if (!this.supported) {
            l.e('The browser does not support the necessary features of File and Blob [webkitSlice || mozSlice || slice]');
            return;
        }

        if (this.config.computeContentMd5) {
            this.supported = typeof FileReader.prototype.readAsArrayBuffer !== 'undefined';
            if (!this.supported) {
                l.e('The browser\'s FileReader object does not support readAsArrayBuffer');
                return;
            }

            if (typeof this.config.cryptoMd5Method !== 'function') {
                l.e('Option computeContentMd5 has been set but cryptoMd5Method is not defined.');
                return;
            }

            if (this.config.awsSignatureVersion === '4') {
                if (typeof this.config.cryptoHexEncodedHash256 !== 'function') {
                    l.e('Option awsSignatureVersion is 4 but cryptoHexEncodedHash256 is not defined.');
                    return;
                }
            }
        } else if (this.config.awsSignatureVersion === '4') {
            l.e('Option awsSignatureVersion is 4 but computeContentMd5 is not enabled.');
            return;
        }
        return true;
    };
    Evaporate.prototype.getPath = function (fileUpload) {
        var path = '/' + this.config.bucket + '/' + fileUpload.name;
        if (this.config.cloudfront || this.awsUrl.indexOf('cloudfront') > -1) {
            path = '/' + fileUpload.name;
        }
        return path;
    };
    Evaporate.prototype.evaporatingCnt = function (incr) {
        this.evaporatingCount = Math.max(0, this.evaporatingCount + incr);
        this.config.evaporateChanged(this, this.evaporatingCount);
    }


    function FileUpload(file, con, evaporate) {
        this.fileTotalBytesUploaded = 0;
        this.s3Parts = [];
        this.partsOnS3 = [];
        this.partsInProcess = [];
        this.partsToUpload = [];
        this.partsDeferredPromises = [];
        this.numParts = -1;
        this.con = con;
        this.evaporate = evaporate;
        this.deferredCompletion = defer();

        extend(this, file);

        this.signParams = con.signParams;
    }
    FileUpload.prototype.con = undefined;
    FileUpload.prototype.evaporate = undefined;
    FileUpload.prototype.numParts = -1;
    FileUpload.prototype.fileTotalBytesUploaded = 0;
    FileUpload.prototype.partsInProcess = [];
    FileUpload.prototype.partsToUpload = [];
    FileUpload.prototype.s3Parts = [];
    FileUpload.prototype.partsOnS3 = [];
    FileUpload.prototype.deferredCompletion = undefined;
    FileUpload.prototype.progressTotalInterval = -1;
    FileUpload.prototype.progressPartsInterval = -1;
    FileUpload.prototype.start = function () {
        l.d('starting FileUpload', this.id);
        this.started(this.id);

        if (this.status === ABORTED) {
            return;
        }

        var awsKey = this.name;

        this.getUnfinishedFileUpload();

        if (typeof this.uploadId === 'undefined') {
            // New File
            return this.uploadFile(awsKey);
        }
        if (typeof this.eTag === 'undefined' || !this.firstMd5Digest || !this.con.computeContentMd5) {
            if (this.partsOnS3.length) { // Resume after Pause
                this.status = EVAPORATING;
                return this.startFileProcessing();
            } else { // Recovery after client error/browser refresh during upload after some parts completed
                // File with some parts on S3
                return this.restartFromUploadedParts();
            }
        }

        // Attempt to reuse entire uploaded object on S3
        var firstPart = this.makePart(1, PENDING, 1);
        this.partsToUpload.push(firstPart);
        var self = this;
        firstPart.awsRequest.getPartMd5Digest()
            .then(function () {
                return self.reuseObject(awsKey);
            });
    };
    FileUpload.prototype.stop = function () {
        l.d('stopping FileUpload ', this.id);
        this.setStatus(CANCELED);
        this.info('Canceling uploads...');
        return this.abortUpload();
    };
    FileUpload.prototype.pause = function (force) {
        l.d('pausing FileUpload ', this.id);
        this.pausedPromise = defer();
        this.info('Pausing uploads...');
        if (force) {
            l.d('Pausing requests to force abort parts that are evaporating');
            // TODO: make sure this doesn't break the promise
            this.abortParts();
            this.setStatus(PAUSED);
            this.paused();
            this.pausedPromise.resolve();
        } else {
            this.setStatus(PAUSING);
            this.pausing();
        }
        return this.pausedPromise.promise;
    };
    FileUpload.prototype.resume = function () {
        if ([PAUSING, PAUSED].indexOf(this.status) > -1) {
            l.d('resuming FileUpload ', this.id);
            this.setStatus(PENDING);
            this.resumed();
        }
    };
    FileUpload.prototype.processPartsToUpload = function () {
        var bytesLoaded = [],
            limit = this.con.maxConcurrentParts - this.evaporate.evaporatingCount;

        if (limit === 0) {
            return;
        }
        if (this.status !== EVAPORATING) {

            this.info('will not process parts list, as not currently evaporating');
            return;
        }

        for (var i = 0; i < this.partsToUpload.length; i++) {
            var part = this.s3Parts[this.partsToUpload[i]];
            if (part.status === EVAPORATING) {
                bytesLoaded.push(part.loadedBytes);
            } else {
                if (this.evaporate.evaporatingCount < this.con.maxConcurrentParts && this.partsInProcess.indexOf(part.part) === -1) {
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
            if (this.evaporate.partsMonitorInterval === PARTS_MONITOR_INTERVALS.online) {
                this.evaporate.partsMonitorInterval = PARTS_MONITOR_INTERVALS.offline;
            }
        } else if (this.evaporate.partsMonitorInterval === PARTS_MONITOR_INTERVALS.offline) {
            l.d('processPartsList() Back online.');
            this.evaporate.partsMonitorInterval = PARTS_MONITOR_INTERVALS.online;
        }
    };
    FileUpload.prototype.removePartFromProcessing = function (partIdx) {
        if (removeAtIndex(this.partsInProcess, partIdx)) {
            this.evaporate.evaporatingCnt(-1);
        }
    };
    FileUpload.prototype.retirePartFromProcessing = function (part) {
        removeAtIndex(this.partsToUpload, part.part);
        this.removePartFromProcessing(part.part);
        if (this.partsInProcess.length === 0 && this.status === PAUSING) {
            this.status = PAUSED;
            this.paused();
            this.pausedPromise.resolve();
        }
    };
    FileUpload.prototype.abortParts = function () {
        var self = this;
        this.partsInProcess.forEach(function (i) {
            if (self.s3Parts[i].awsRequest) {
                self.s3Parts[i].awsRequest.abort();
            }
        });
        this.monitorTotalProgress();
    };
    FileUpload.prototype.makeParts = function () {
        this.numParts = Math.ceil(this.file.size / this.con.partSize) || 1; // issue #58
        var partsDeferredPromises = [];

        for (var part = 1; part <= this.numParts; part++) {
            var s3Part = this.s3Parts[part];
            if (typeof s3Part !== "undefined"){
                if(s3Part.status === COMPLETE) { continue; }
            } else {
                this.makePart(part, PENDING, this.file.size);
            }

            this.partsToUpload.push(part);
            partsDeferredPromises.push(this.s3Parts[part].deferred.promise);
        }

        this.setStatus(EVAPORATING);
        this.startFileProcessing();
        return Promise.all(partsDeferredPromises);
    };
    FileUpload.prototype.makePart = function (partNumber, status, size) {
        var part = {
            status: status,
            loadedBytes: 0,
            loadedBytesPrevious: null,
            isEmpty: (size === 0), // issue #58
            md5_digest: null,
            part: partNumber
        };

        if (status !== COMPLETE) {
            part.awsRequest = new PutPart(this, part);
            part.deferred = defer();
        }

        this.s3Parts[partNumber] = part;

        return part;
    };
    FileUpload.prototype.startFileProcessing =function () {
        this.monitorProgress();
        this.processPartsToUpload();
    };
    FileUpload.prototype.monitorTotalProgress = function () {
        var self = this;
        clearInterval(this.progressTotalInterval);
        this.progressTotalInterval = setInterval(function () {

            var totalBytesLoaded = this.fileTotalBytesUploaded;
            self.partsInProcess.forEach(function (i) {
                totalBytesLoaded += self.s3Parts[i].loadedBytes;
            });

            self.progress(totalBytesLoaded / this.sizeBytes);
        }, this.con.progressIntervalMS);
    };
    FileUpload.prototype.monitorPartsProgress =function () {
        /*
         Issue #6 identified that some parts would stall silently.
         The issue was only noted on Safari on OSX. A bug was filed with Apple, #16136393
         This function was added as a work-around. It checks the progress of each part every 2 minutes.
         If it finds a part that has made no progress in the last 2 minutes then it aborts it. It will then be detected as an error, and restarted in the same manner of any other errored part
         */
        clearInterval(this.progressPartsInterval);
        var self = this;
        this.progressPartsInterval = setInterval(function () {

            l.d('monitorPartsProgress()');
            self.partsInProcess.forEach(function (partIdx) {

                var part = self.s3Parts[partIdx],
                    healthy;

                if (part.loadedBytesPrevious === null) {
                    part.loadedBytesPrevious = part.loadedBytes;
                    return;
                }

                healthy = part.loadedBytesPrevious < part.loadedBytes;
                if (self.con.simulateStalling && partIdx === 4) {
                    if (Math.random() < 0.25) {
                        healthy = false;
                    }
                }

                l.d(partIdx, (healthy ? 'moving.' : 'stalled.'), part.loadedBytesPrevious, part.loadedBytes);

                if (!healthy) {
                    setTimeout(function () {
                        self.info('part #' + partIdx, ' stalled. will abort.', part.loadedBytesPrevious, part.loadedBytes);
                        self.s3Parts[partIdx].awsRequest.abort();
                        part.status = PENDING;
                        self.removePartFromProcessing(partIdx);
                        self.processPartsToUpload();
                    }, 0);
                }

                part.loadedBytesPrevious = part.loadedBytes;
            });
        }, this.evaporate.partsMonitorInterval);
    };
    FileUpload.prototype.monitorProgress =function () {
        this.monitorTotalProgress();
        this.monitorPartsProgress();
    };
    FileUpload.prototype.setStatus = function (s) {

        if ([COMPLETE, ERROR, CANCELED, ABORTED, PAUSED].indexOf(s) > -1) {
            this.stopMonitorProgress();
        }
        this.status = s;
        this.onStatusChange();
    };
    FileUpload.prototype.stopMonitorProgress = function () {
        clearInterval(this.progressTotalInterval);
        clearInterval(this.progressPartsInterval);
    };
    FileUpload.prototype.createUploadFile = function () {
        var fileKey = uploadKey(this),
            newUpload = {
                awsKey: this.name,
                bucket: this.con.bucket,
                uploadId: this.uploadId,
                fileSize: this.file.size,
                fileType: this.file.type,
                lastModifiedDate: dateISOString(this.file.lastModifiedDate),
                partSize: this.con.partSize,
                signParams: this.con.signParams,
                createdAt: new Date().toISOString()
            };
        saveUpload(fileKey, newUpload);
    };
    FileUpload.prototype.updateUploadFile = function (updates) {
        var fileKey = uploadKey(this);
        var uploads = getSavedUploads();
        var upload = Object.assign({}, uploads[fileKey], updates);
        saveUpload(fileKey, upload);
    };
    FileUpload.prototype.completeUploadFile = function () {
        var uploads = getSavedUploads(),
            upload = uploads[uploadKey(this)];

        if (typeof upload !== 'undefined') {
            upload.completedAt = new Date().toISOString();
            upload.eTag = this.eTag;
            historyCache.setItem('awsUploads', JSON.stringify(uploads));
        }

        this.setStatus(COMPLETE);
        this.progress(1.0);
    };
    FileUpload.prototype.removeUploadFile = function (){
        if (typeof this.file !== 'undefined') {
            removeUpload(uploadKey(this));
        }
    };
    FileUpload.prototype.getUnfinishedFileUpload = function () {
        var savedUploads = getSavedUploads(true),
            u = savedUploads[uploadKey(this)];

        if (this.canRetryUpload(u)) {
            this.uploadId = u.uploadId;
            this.name = u.awsKey;
            this.eTag = u.eTag;
            this.firstMd5Digest = u.firstMd5Digest;
            this.signParams = u.signParams;
        }
    };
    FileUpload.prototype.canRetryUpload = function (u) {
        // Must be the same file name, file size, last_modified, file type as previous upload
        if (typeof u === 'undefined') {
            return false;
        }
        var completedAt = new Date(u.completedAt || FAR_FUTURE);

        // check that the part sizes and bucket match, and if the file name of the upload
        // matches if onlyRetryForSameFileName is true
        return this.con.partSize === u.partSize &&
            completedAt > HOURS_AGO &&
            this.con.bucket === u.bucket &&
            (this.con.onlyRetryForSameFileName ? this.name === u.awsKey : true);
    };

    FileUpload.prototype.uploadFile = function (awsKey) {
        var self = this;
        return new Promise(function (resolve, reject) {
            new InitiateMultipartUpload(self, awsKey)
                .send()
                .then(
                    function () {
                        self.partsToUpload = [];
                        self.makeParts()
                            .then(
                                function () {
                                    new CompleteMultipartUpload(self)
                                        .send()
                                        .then(resolve);
                                },
                                function () {
                                    self.abortUpload(true)
                                        .then(resolve, reject);
                                }
                            );
                    });
        })
            .then(
                function () {
                    self.deferredCompletion.resolve(self.id);
                },
                function (reason) {
                    self.deferredCompletion.reject(reason);
                }
            );
    };
    FileUpload.prototype.abortUpload = function (partError) {
        var self = this;
        return new Promise(function (resolve, reject) {

            if(typeof self.uploadId === 'undefined') {
                resolve();
                return;
            }

            new DeleteMultipartUpload(self, partError)
                .send()
                .then(
                    function (xhr) {
                        if (xhr.status === 404) {
                            return resolve();
                        }
                        return new VerifyPartsAborted(self, partError)
                            .send()
                            .then(resolve, reject);
                    },
                    reject);
        })
            .then(
                function () {
                    self.setStatus(ABORTED);
                    self.cancelled();
                    self.deferredCompletion.resolve(self.id);
                },
                self.deferredCompletion.reject.bind(self));
    };
    FileUpload.prototype.restartFromUploadedParts = function () {
        var self = this;
        if (self.con.allowS3ExistenceOptimization &&
            self.firstMd5Digest === self.s3Parts[1].md5_digest) {
            return false;
        } else {
            //return uploadFile(fileUpload, fileUpload.name);
        }
        return new Promise(function (resolve, reject) {
            new GetMultipartUploadParts(self)
                .send()
                .then(
                    function (xhr) {
                        if (xhr.status === 404) {
                            // Success! Upload is no longer recognized, so there is nothing to fetch

                            self.info(['uploadId ', self.uploadId, ' does not exist.'].join(''));
                            self.removeUploadFile();
                            return self.uploadFile(self.name)
                                .then(resolve, reject);
                        }
                        self.makeParts()
                            .then(
                                function () {
                                    new CompleteMultipartUpload(self)
                                        .send()
                                        .then(resolve);
                                },
                                function () {
                                    self.abortUpload(true);
                                }
                            );
                    }, reject);
        })
            .then(
                function () {
                    self.deferredCompletion.resolve(self.id);
                },
                function (reason) {
                    self.deferredCompletion.reject(reason);
                }
            );
    };
    FileUpload.prototype.reuseObject = function (awsKey) {
        var self = this;

        return new Promise(function (resolve, reject) {

            if (self.con.allowS3ExistenceOptimization &&
                self.firstMd5Digest === self.s3Parts[1].md5_digest) {
                // TODO: What's this?

            } else {
                return self.uploadFile(awsKey);
            }

            new ReuseS3Object(self, awsKey)
                .send()
                .then(
                    function (xhr) {
                        var eTag = xhr.getResponseHeader('Etag');
                        if (eTag === self.eTag) {
                            l.d('headObject found matching object on S3.');
                            self.progress(1.0);
                            self.complete(xhr, self.name);
                            self.setStatus(COMPLETE);
                            resolve();
                        } else {
                            l.d('headObject not found on S3.');
                            self.info(['uploadId ', self.uploadId, ' does not exist.'].join(''));
                            self.removeUploadFile();
                            self.uploadFile(self.name)
                                .then(resolve, reject);
                        }
                    },
                    function (reason) {
                        reject(reason);
                    });
        })
            .then(
                function () {
                    self.deferredCompletion.resolve(self.id);
                },
                function (reason) {
                    self.deferredCompletion.reject(reason);
                }
            );
        ;

    };


    function SignedS3AWSRequest(fileUpload, request) {
        this.fileUpload = fileUpload;
        this.evaporate = fileUpload.evaporate;
        this.con = fileUpload.con;
        this.request = request;
        this.attempts = 1;
        this.signer = this.evaporate.signingClass(request, this.getPayload());
    }
    SignedS3AWSRequest.prototype.fileUpload = 0;
    SignedS3AWSRequest.prototype.con = undefined;
    SignedS3AWSRequest.prototype.evaporate = undefined;
    SignedS3AWSRequest.prototype.awsDeferred = undefined;
    SignedS3AWSRequest.prototype.success = function () {};
    SignedS3AWSRequest.prototype.error =  function (reason) {
        if (this.errorExceptionStatus()) {
            return;
        }

        l.d(this.request.step, ' error ', this.fileUpload.id);

        if (typeof this.errorHandler(reason) !== 'undefined' ) {
            return;
        }

        this.fileUpload.warn('Error in ', this.request.step, reason);
        this.fileUpload.setStatus(ERROR);

        var self = this,
            backOffWait = (this.attempts === 1) ? 0 : 1000 * Math.min(
                this.con.maxRetryBackoffSecs,
                Math.pow(this.con.retryBackoffPower, this.attempts - 2)
            );
        this.attempts += 1;

        setTimeout(function () {
            if (!self.errorExceptionStatus()) { self.trySend(); }
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
            self.con.awsLambda.invoke({
                FunctionName: self.con.awsLambdaFunction,
                InvocationType: 'RequestResponse',
                Payload: JSON.stringify({
                    to_sign: self.signer.stringToSign(),
                    sign_params: self.makeSignParamsObject(self.fileUpload.signParams),
                    sign_headers: self.makeSignParamsObject(self.con.signHeaders)
                })
            }, function (err, data) {
                if (err) {
                    var warnMsg = 'failed to get authorization with lambda ' + err;
                    l.w(warnMsg);
                    self.fileUpload.warn(warnMsg);
                    return reject(warnMsg);
                }
                resolve(self.signResponse(JSON.parse(data.Payload)));
            });
        });
    };
    SignedS3AWSRequest.prototype.signResponse = function(payload, stringToSign, signatureDateTime) {
        if (typeof this.con.signResponseHandler === 'function') {
            payload = this.con.signResponseHandler(payload, stringToSign, signatureDateTime) || payload;
        }

        return payload;
    };
    SignedS3AWSRequest.prototype.sendRequestToAWS = function () {
        var self = this;
        return new Promise( function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            self.currentXhr = xhr;

            var payload = self.getPayload(),
                url = self.evaporate.awsUrl + self.request.path,
                all_headers = {};

            if (self.request.query_string) {
                url += self.request.query_string;
            }
            extend(all_headers, self.request.not_signed_headers);
            extend(all_headers, self.request.x_amz_headers);

            if (self.con.simulateErrors && self.request.attempts === 1 && self.request.step === 'upload #3') {
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

            if (self.con.awsSignatureVersion === '4') {
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
                        var reason = xhr.responseText ? getAwsResponse(xhr) : '';
                        reason += 'status:' + xhr.status
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


            if (self.con.awsLambda) {
                self.authorizedSignWithLambda()
                    .then(function (signature) {
                        resolve(signature);
                    }, function (reason) {
                        reject(reason)
                    })
                return;
            }

            var stringToSign = self.stringToSign(),
                url = [self.con.signerUrl, '?to_sign=', stringToSign, '&datetime=', self.request.dateString].join('');

            if (typeof self.con.signerUrl === 'undefined') {
                result = self.signResponse(null, stringToSign, self.request.dateString);
                return result ? resolve(result) : reject('signResponse returned no signature.')
            }

            var signParams = self.makeSignParamsObject(self.fileUpload.signParams);
            for (var param in signParams) {
                if (!signParams.hasOwnProperty(param)) { continue; }
                url += ('&' + encodeURIComponent(param) + '=' + encodeURIComponent(signParams[param]));
            }

            if (self.con.xhrWithCredentials) {
                xhr.withCredentials = true;
            }

            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {

                    if (xhr.status === 200) {
                        var payload = self.signResponse(xhr.response);

                        if (self.con.awsSignatureVersion === '2' &&  payload.length !== 28) {
                            reject("V2 signature length !== 28");
                        } else {
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
            var signHeaders = self.makeSignParamsObject(self.con.signHeaders);
            for (var header in signHeaders) {
                if (!signHeaders.hasOwnProperty(header)) { continue; }
                xhr.setRequestHeader(header, signHeaders[header])
            }

            if (typeof self.fileUpload.beforeSigner  === 'function') {
                self.fileUpload.beforeSigner(xhr, url);
            }
            xhr.send();
        });
    };
    SignedS3AWSRequest.prototype.sendAuthorizedRequest = function () {
        l.d('setupRequest()', this.request);

        var datetime = this.con.timeUrl ? new Date(new Date().getTime() + this.evaporate.localTimeOffset) : new Date();
        if (this.con.awsSignatureVersion === '4') {
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
    SignedS3AWSRequest.prototype.trySend = function () {
        var self = this;
        return this.sendAuthorizedRequest()
            .then(
                function (value) {
                    self.authorizationSuccess(value);
                    self.sendRequestToAWS()
                        .then(
                            function (value) {
                                if (self.success(value)) {
                                    self.awsDeferred.resolve(value);
                                }
                            },
                            self.error.bind(self));
                },
                self.error.bind(self));
    };
    SignedS3AWSRequest.prototype.send = function () {
        this.awsDeferred = defer();
        this.trySend()
        return this.awsDeferred.promise;
    };

    function CancelableS3AWSRequest(fileUpload, request) {
        SignedS3AWSRequest.call(this, fileUpload, request);
    }
    CancelableS3AWSRequest.prototype = Object.create(SignedS3AWSRequest.prototype);
    CancelableS3AWSRequest.prototype.constructor = CancelableS3AWSRequest;
    CancelableS3AWSRequest.prototype.errorExceptionStatus = function () {
        return [ABORTED, CANCELED].indexOf(this.fileUpload.status) < -1;
    };

    function SignedS3AWSRequestWithRetryLimit(fileUpload, request, maxRetries) {
        if (maxRetries > -1) {
            this.maxRetries = maxRetries;
        }
        SignedS3AWSRequest.call(this, fileUpload, request);
    }
    SignedS3AWSRequestWithRetryLimit.prototype = Object.create(CancelableS3AWSRequest.prototype);
    SignedS3AWSRequestWithRetryLimit.prototype.constructor = SignedS3AWSRequestWithRetryLimit;
    SignedS3AWSRequestWithRetryLimit.prototype.maxRetries = 1;
    SignedS3AWSRequestWithRetryLimit.prototype.errorHandler =  function (reason) {
        if (this.attempts > this.maxRetries) {
            var msg = ['MaxRetries exceeded. Will re-upload file id ', this.fileUpload.id, ', ', reason];
            l.w(msg.join(""));
            return this.fileUpload.uploadFile(this.awsKey);
        }
    };

    // see: http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadInitiate.html
    function InitiateMultipartUpload(fileUpload, awsKey) {
        var request = {
            method: 'POST',
            path: fileUpload.evaporate.getPath(fileUpload) + '?uploads',
            step: 'initiate',
            x_amz_headers: fileUpload.xAmzHeadersAtInitiate,
            not_signed_headers: fileUpload.notSignedHeadersAtInitiate,
            response_match: '<UploadId>(.+)<\/UploadId>'
        };

        if (fileUpload.contentType) {
            request.contentType = fileUpload.contentType;
        }

        CancelableS3AWSRequest.call(this, fileUpload, request);
        this.awsKey = awsKey;
    }
    InitiateMultipartUpload.prototype = Object.create(CancelableS3AWSRequest.prototype);
    InitiateMultipartUpload.prototype.constructor = InitiateMultipartUpload;
    InitiateMultipartUpload.prototype.success = function (xhr) {
        var match = xhr.response.match(new RegExp(this.request.response_match));
        this.fileUpload.uploadId = match[1];
        this.fileUpload.awsKey = this.awsKey;
        l.d('requester success. got uploadId', this.fileUpload.uploadId);
        this.fileUpload.createUploadFile();
        return true;
    };

    //http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadComplete.html
    function CompleteMultipartUpload(fileUpload) {
        l.d('completeUpload', fileUpload);
        fileUpload.info('will attempt to complete upload');
        fileUpload.stopMonitorProgress();
        var request = {
            method: 'POST',
            contentType: 'application/xml; charset=UTF-8',
            path: fileUpload.evaporate.getPath(fileUpload) + '?uploadId=' + fileUpload.uploadId,
            x_amz_headers: fileUpload.xAmzHeadersCommon || fileUpload.xAmzHeadersAtComplete,
            step: 'complete'
        };
        CancelableS3AWSRequest.call(this, fileUpload, request);
    }
    CompleteMultipartUpload.prototype = Object.create(CancelableS3AWSRequest.prototype);
    CompleteMultipartUpload.prototype.constructor = CompleteMultipartUpload;
    CompleteMultipartUpload.prototype.success = function (xhr) {
        var oDOM = parseXml(xhr.responseText),
            result = oDOM.getElementsByTagName("CompleteMultipartUploadResult")[0];
        this.fileUpload.eTag = nodeValue(result, "ETag");
        this.fileUpload.complete(xhr, this.fileUpload.name);
        this.fileUpload.completeUploadFile();
        return true;
    };
    CompleteMultipartUpload.prototype.getPayload = function () {
        var completeDoc = [];
        completeDoc.push('<CompleteMultipartUpload>');
        this.fileUpload.s3Parts.forEach(function (part, partNumber) {
            if (partNumber > 0) {
                completeDoc.push(['<Part><PartNumber>', partNumber, '</PartNumber><ETag>', part.eTag, '</ETag></Part>'].join(""));
            }
        });
        completeDoc.push('</CompleteMultipartUpload>');

        return completeDoc.join("");
    };

    //http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadComplete.html
    function ReuseS3Object(fileUpload, awsKey) {
        this.awsKey = awsKey;

        l.d('headObject');
        fileUpload.info('will attempt to verify existence of the file');

        var request = {
            method: 'HEAD',
            path: fileUpload.evaporate.getPath(fileUpload),
            x_amz_headers: fileUpload.xAmzHeadersCommon,
            success404: true,
            step: 'head_object'
        };

        SignedS3AWSRequestWithRetryLimit.call(this, fileUpload, request);
    }
    ReuseS3Object.prototype = Object.create(SignedS3AWSRequestWithRetryLimit.prototype);
    ReuseS3Object.prototype.constructor = ReuseS3Object;
    ReuseS3Object.prototype.awsKey = undefined;
    ReuseS3Object.prototype.errorHandler =  function (reason) {
        if (this.attempts > this.maxRetries) {
            var msg = ['MaxRetries exceeded. Will re-upload file id ', this.fileUpload.id, ', ', reason];
            l.w(msg.join(""));
            return this.fileUpload.uploadFile(this.awsKey);
        }
    };
    ReuseS3Object.prototype.success = function () {
        return true;
    };

    //http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadListParts.html
    function GetMultipartUploadParts(fileUpload) {
        this.fileUpload = fileUpload;
        SignedS3AWSRequestWithRetryLimit.call(this, fileUpload, this.setupRequest(0));
    }
    GetMultipartUploadParts.prototype = Object.create(SignedS3AWSRequestWithRetryLimit.prototype);
    GetMultipartUploadParts.prototype.constructor = GetMultipartUploadParts;
    GetMultipartUploadParts.prototype.awsKey = undefined;
    GetMultipartUploadParts.prototype.partNumberMarker = 0;
    GetMultipartUploadParts.prototype.setupRequest = function (partNumberMarker) {
        var msg = ['getUploadParts() for uploadId starting at part #', partNumberMarker].join(" ");
        l.d(msg);

        this.fileUpload.info(msg);

        this.awsKey = this.fileUpload.name;
        this.partNumberMarker = partNumberMarker;

        var path = this.fileUpload.evaporate.getPath(this.fileUpload);
        var request = {
            method: 'GET',
            path: path + '?uploadId=' + this.fileUpload.uploadId,
            query_string: "&part-number-marker=" + partNumberMarker,
            x_amz_headers: this.fileUpload.xAmzHeadersCommon,
            step: 'get upload parts',
            success404: true
        };

        if (this.fileUpload.con.awsSignatureVersion === '4') {
            request.path = [path, '?uploadId=', this.fileUpload.uploadId, "&part-number-marker=" + partNumberMarker].join("");
        }

        this.request = request;
        return request;
    };
    GetMultipartUploadParts.prototype.success = function (xhr) {
        if (xhr.status === 404) {
            // Success! Upload is no longer recognized, so there is nothing to fetch

            this.fileUpload.info(['uploadId ', this.fileUpload.uploadId, ' does not exist.'].join(''));
            this.fileUpload.removeUploadFile();
            return true;
        }

        this.fileUpload.info('uploadId', this.fileUpload.uploadId, 'is not complete. Fetching parts from part marker', this.partNumberMarker);
        var oDOM = parseXml(xhr.responseText),
            listPartsResult = oDOM.getElementsByTagName("ListPartsResult")[0],
            isTruncated = nodeValue(listPartsResult, "IsTruncated") === 'true',
            uploadedParts = oDOM.getElementsByTagName("Part"),
            parts_len = uploadedParts.length,
            cp, partSize;

        for (var i = 0; i < parts_len; i++) {
            cp = uploadedParts[i];
            partSize = parseInt(nodeValue(cp, "Size"), 10);
            this.fileUpload.fileTotalBytesUploaded += partSize;
            this.fileUpload.partsOnS3.push({
                eTag: nodeValue(cp, "ETag"),
                partNumber: parseInt(nodeValue(cp, "PartNumber"), 10),
                size: partSize,
                LastModified: nodeValue(cp, "LastModified")
            });
        }

        if (isTruncated) {
            this.setupRequest(nodeValue(listPartsResult, "NextPartNumberMarker")); // let's fetch the next set of parts
            this.trySend();
            listPartsResult = null;  // We don't need these potentially large object any longer
        } else {
            var self = this;
            this.fileUpload.partsOnS3.forEach(function (cp) {
                var uploadedPart = self.fileUpload.makePart(cp.partNumber, COMPLETE, cp.size);
                uploadedPart.eTag = cp.eTag;
                uploadedPart.loadedBytes = cp.size;
                uploadedPart.loadedBytesPrevious = cp.size;
                uploadedPart.finishedUploadingAt = cp.LastModified;
            });
            return true;
        }
    };

    //http://docs.aws.amazon.com/AmazonS3/latest/API/mpUploadUploadPart.html
    function PutPart(fileUpload, part) {
        this.part = part;

        this.partNumber = part.part;
        this.start = (this.partNumber - 1) * fileUpload.con.partSize;
        this.end = this.partNumber * fileUpload.con.partSize;

        var self = this;

        var request = {
            method: 'PUT',
            path: fileUpload.evaporate.getPath(fileUpload) + '?partNumber=' + this.partNumber + '&uploadId=' + fileUpload.uploadId,
            step: 'upload #' + this.partNumber,
            x_amz_headers: fileUpload.xAmzHeadersCommon || fileUpload.xAmzHeadersAtUpload,
            contentSha256: "UNSIGNED-PAYLOAD",
            onProgress: function (evt) {
                self.part.loadedBytes = evt.loaded;
            }
        };

        SignedS3AWSRequest.call(this, fileUpload, request);
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
            if (self.con.computeContentMd5 && !part.md5_digest) {
                reader.onloadend = function () {
                    var md5_digest = self.con.cryptoMd5Method.call(this, this.result);
                    reader = undefined;
                    if (self.partNumber === 1 && self.con.computeContentMd5 && typeof self.fileUpload.firstMd5Digest === "undefined") {
                        self.fileUpload.updateUploadFile({firstMd5Digest: md5_digest})
                    }
                    resolve(md5_digest);
                };

                reader.readAsArrayBuffer(getFilePart(self.fileUpload.file, self.start, self.end));
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
            [ABORTED, PAUSED, CANCELED].indexOf(this.fileUpload.status) === -1 &&
            this.fileUpload.partsInProcess.indexOf(this.partNumber) === -1) {

            l.d('uploadPart #', this.partNumber, this.attempts === 1 ? 'submitting' : 'retrying');

            this.part.status = EVAPORATING;
            this.attempts += 1;
            this.part.loadedBytesPrevious = null;

            if (this.fileUpload.partsInProcess.indexOf(this.partNumber) === -1) {
                this.fileUpload.partsInProcess.push(this.partNumber);
                this.evaporate.evaporatingCnt(+1);
            }

            l.d('upload #', this.partNumber, this.request);

            var self = this;
            return this.getPartMd5Digest()
                .then(function () {
                    self.send();
                    self.fileUpload.processPartsToUpload();
                });
        }

    };
    PutPart.prototype.success = function (xhr) {
        var eTag = xhr.getResponseHeader('ETag'), msg;

        l.d('uploadPart 200 response for part #', this.partNumber, 'ETag:', eTag);
        if (this.part.isEmpty || (eTag !== ETAG_OF_0_LENGTH_BLOB)) { // issue #58
            this.part.eTag = eTag;
            this.part.status = COMPLETE;

            this.fileUpload.partsOnS3.push(this.part);
            this.fileUpload.fileTotalBytesUploaded += this.part.loadedBytes;
            this.part.deferred.resolve();
            this.fileUpload.retirePartFromProcessing(this.part);
        } else {
            this.part.status = ERROR;
            this.part.loadedBytes = 0;
            msg = ['eTag matches MD5 of 0 length blob for part #', this.partNumber, 'Retrying part.'].join(" ");
            l.w(msg);
            this.fileUpload.warn(msg);
            this.fileUpload.removePartFromProcessing(this.partNumber)
        }
        if ([PAUSED, PAUSING].indexOf(this.fileUpload.status) === -1) {
            this.fileUpload.processPartsToUpload();
        }
        return true;
    };
    PutPart.prototype.error =  function (reason) {
        this.part.loadedBytes = 0;

        this.part.status = ERROR;

        if ([CANCELED, ABORTED, PAUSED, PAUSING].indexOf(this.fileUpload.status) > -1) {
            return;
        }
        if (reason.match(/status:404/)) {
            this.fileUpload.retirePartFromProcessing(this.part);

            var errMsg = '404 error on part PUT. The part and the file will abort.';
            l.w(errMsg);
            this.fileUpload.error(errMsg);
            this.part.status = ABORTED;
            this.part.deferred.reject();
            this.fileUpload.abortUpload(true);
            return true;
        } else {
            var msg = 'problem uploading part #' + this.partNumber + ',  reason: ' + reason;

            l.w(msg);
            this.fileUpload.warn(msg);

            this.fileUpload.removePartFromProcessing(this.partNumber);
            this.fileUpload.processPartsToUpload();
        }
    };
    PutPart.prototype.abort = function () {
        if (this.currentXhr) {
            this.currentXhr.abort();
            this.part.loadedBytes = 0;
        }
    };
    PutPart.prototype.getPayload = function () {
        var slice = getFilePart(this.fileUpload.file, this.start, this.end);
        l.d('part #', this.partNumber, '( bytes', this.start, '->', this.end, ')  reported length:', slice.size);
        if (!this.part.isEmpty && slice.size === 0) { // issue #58
            l.w('  *** WARN: blob reporting size of 0 bytes. Will try upload anyway..');
        }
        return slice;
    };

    //http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadAbort.html
    function DeleteMultipartUpload(fileUpload, partError) {
        l.d('abortUpload');
        this.isPartError = !!partError;

        fileUpload.info('will attempt to abort the upload');

        fileUpload.abortParts();

        var request = {
            method: 'DELETE',
            path: fileUpload.evaporate.getPath(fileUpload) + '?uploadId=' + fileUpload.uploadId,
            x_amz_headers: fileUpload.xAmzHeadersCommon,
            success404: true,
            step: 'abort'
        };

        SignedS3AWSRequest.call(this, fileUpload, request);
    }
    DeleteMultipartUpload.prototype = Object.create(SignedS3AWSRequest.prototype);
    DeleteMultipartUpload.prototype.constructor = DeleteMultipartUpload;
    DeleteMultipartUpload.prototype.isPartError = false;
    DeleteMultipartUpload.prototype.maxRetries = 1;
    DeleteMultipartUpload.prototype.success = function () {
        this.fileUpload.setStatus(ABORTED);
        return true;
    };
    DeleteMultipartUpload.prototype.errorHandler =  function (reason) {
        if (this.attempts > this.maxRetries) {
            var msg = 'Error aborting upload, Exceeded retries deleting the file upload: ' + reason;
            l.w(msg);
            this.fileUpload.error(msg);
            this.awsDeferred.reject(reason)
            // this.fileUpload.deferredCompletion.reject('Exceeded retries deleting the file upload.');
            return true;
        }
    };

    // http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadListParts.html
    function VerifyPartsAborted(fileUpload, partError) {
        l.d('listParts');
        fileUpload.info('list parts');

        this.awsKey = fileUpload.name;
        this.isPartError = !!partError;
        var request = {
            method: 'GET',
            path: fileUpload.evaporate.getPath(fileUpload) + '?uploadId=' + fileUpload.uploadId,
            x_amz_headers: fileUpload.xAmzHeadersCommon,
            step: 'list',
            success404: true
        };

        SignedS3AWSRequest.call(this, fileUpload, request);
    }
    VerifyPartsAborted.prototype = Object.create(SignedS3AWSRequest.prototype);
    VerifyPartsAborted.prototype.isPartError = false;
    VerifyPartsAborted.prototype.constructor = VerifyPartsAborted;
    VerifyPartsAborted.prototype.maxRetries = 1;
    VerifyPartsAborted.prototype.awsKey = undefined;
    VerifyPartsAborted.prototype.success = function (xhr) {
        if (xhr.status === 404) {
            // Success! Parts are not found because the uploadid has been cleared
            this.fileUpload.removeUploadFile();
        } else {
            var oDOM = parseXml(xhr.responseText);
            var domParts = oDOM.getElementsByTagName("Part");
            if (domParts.length) { // Some parts are still uploading
                l.d('Parts still found after abort...waiting.');
                var self = this;
                setTimeout(function () { self.trySend(); }, this.con.abortCompletionThrottlingMs);
                return;
            }
        }
        this.fileUpload.fileTotalBytesUploaded = 0;

        this.fileUpload.info('upload canceled');
        this.evaporate.evaporatingCount = 0;
        this.con.evaporateChanged(this.fileUpload, this.evaporate.evaporatingCount);
        var msg = this.isPartError ? 'File upload aborted due to an unrecoverable error uploading a part.' : 'File upload aborted.';
        return true;
    };
    VerifyPartsAborted.prototype.errorHandler =  function (reason) {
        if (this.attempts > this.maxRetries) {
            var msg = 'Error listing parts. ' + reason;
            l.w(msg);
            this.fileUpload.error(msg);
            this.evaporate.evaporatingCount = 0;
            this.con.evaporateChanged(this.fileUpload, this.evaporate.evaporatingCount);
            this.fileUpload.cancelled();
            msg = this.isPartError ?
                'Exceeded retries checking for remaining parts deleting a file upload due to a part failing to upload.'
                : 'Exceeded retries checking for remaining parts after deleting a file upload.';
            this.awsDeferred.reject(msg);
            return true;
        }
    };


    function signingVersion(con, l, AWS_HOST) {
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

        return con.awsSignatureVersion === '4' ? AwsSignatureV4 : AwsSignatureV2;
    }

    function getLocalTimeOffset(con) {
        return new Promise(function (resolve) {
            if (con.timeUrl) {
                var xhr = new XMLHttpRequest();

                xhr.open("GET", con.timeUrl + '?requestTime=' + new Date().getTime());
                xhr.onreadystatechange = function () {
                    if (xhr.readyState === 4) {
                        if (xhr.status === 200) {
                            var server_date = new Date(Date.parse(xhr.responseText)),
                                now = new Date();
                            resolve(now - server_date);
                        }
                    }
                };

                xhr.onerror = function (xhr) {
                    l.e('xhr error timeUrl', xhr);
                    resolve(0);
                };
                xhr.send();
            } else {
                resolve(0);
            }
        });
    }

    function awsUrl(con) {
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
        return url.join("");
    }

    function s3EncodedObjectName(fileName) {
        var fileParts = fileName.split('/'),
            encodedParts = [];
        fileParts.forEach(function (p) {
            encodedParts.push(encodeURIComponent(p).replace(/\(/g, "%28").replace(/\)/g, "%29"));
        });
        return encodedParts.join('/');
    }

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
        return date ? new Date(date).toISOString() : '';
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

    function nodeValue(parent, nodeName) {
        return parent.getElementsByTagName(nodeName)[0].textContent;
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

    function removeAtIndex(a, i) {
        var idx = a.indexOf(i);
        if (idx > -1) {
            a.splice(idx, 1);
            return true;
        }
    }

    var historyCache = {
        supported: function () {
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
        },
        getItem: function (key) {
            if (this.supported()) {
                return localStorage.getItem(key)
            }
        },
        setItem: function (key, value) {
            if (this.supported()) {
                return localStorage.setItem(key, value);
            }
        },
        clear: function () {
            if (this.supported()) {
                return localStorage.clear();
            }
        },
        key: function (key) {
            if (this.supported()) {
                return localStorage.key(key);
            }
        },
        removeItem: function (key) {
            if (this.supported()) {
                return localStorage.removeItem(key);
            }
        }
    };

    function noOpLogger() { return {d: function () {}, w: function () {}, e: function () {}}; }

    l = noOpLogger();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Evaporate;
    } else if (typeof window !== 'undefined') {
        window.Evaporate = Evaporate;
    }

}());
