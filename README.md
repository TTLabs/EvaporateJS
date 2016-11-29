Evaporate
=========

[![Build Status](https://travis-ci.org/bikeath1337/EvaporateJS.svg?branch=master)](https://travis-ci.org/bikeath1337/EvaporateJS)
[![Code Climate](https://codeclimate.com/github/TTLabs/EvaporateJS/badges/gpa.svg)](https://codeclimate.com/github/TTLabs/EvaporateJS)

### File Upload API for AWS S3

Evaporate is a javascript library for uploading files from a browser to
AWS S3, using parallel S3's multipart uploads with MD5 checksum support
and control over pausing / resuming the upload.

Major features include:

- Configurable number of parallel uploads for each part (`maxConcurrentParts`)
- Configurable MD5 Checksum calculations and handling for each uploaded
  part (`computeContentMd5`)
- AWS Signature Version 2 and 4 (`awsSignatureVersion`)
- S3 Transfer Acceleration (`s3Acceleration`)
- Robust recovery when uploading huge files. Only parts that
  have not been fully uploaded again. (`s3FileCacheHoursAgo`, `allowS3ExistenceOptimization`)
- Ability to pause and resume downloads at will
- Pluggable signing methods to support AWS Lambda, async functions and more.

New Features in v2.0:
- Parallel file uploads while respecting `maxConcurrentParts`.
- If Evaporate reuses an interrupted upload or avoids uploading a file that is already available on S3, the new
  callback `nameChanged` will be invoked with the previous object name at the earliest moment. This indicates
  that requested object name was not used.
- Pause, Resume, Cancel now can act on all in-progress file uploads
- Pluggable signing methods with `customAuthMethod`. AWS Lambda functions must be implemente through this option.
- Signing methods can respond to 401 and 403 response statuses and not trigger the automatic retry feature.
- The `progress()` and `complete()` callbacks now provide upload stats like transfer rate and time remaining.
- Reduced memory footprint when calculating MD5 digests.


#### Browser Compatibility
Any browser that supports the JavaScript [File API](https://developer.mozilla.org/en-US/docs/Web/API/File)
should be compatible. The File API, includes the `FileReader` object that
Evaporate uses to calculate MD5 checksums through the `readAsArrayBuffer`
method. Refer to this [list of browsers that support the File API](http://caniuse.com/#feat=fileapi).
Evaporate does not invoke the `File` constructor.

As of v2.0.0, Evaporate requires a browser that supports
[ES6 Promises](http://people.mozilla.org/~jorendorff/es6-draft.html#sec-promise-constructor). To use Evaporate on
those browsers, you must include a compliant Promise polyfill such as
[es6-promise](https://github.com/stefanpenner/es6-promise). Refer to this [list of browsers that support
Promises](http://caniuse.com/#feat=promises).

## Authors

  - Bobby Wallace ([bikeath1337](http://github.com/bikeath1337))
  - Tom Saffell ([tomsaffell](http://github.com/tomsaffell))

## Installation

Evaporate is published as a Node module:

```bash
$ npm install evaporate
```

Otherwise, include it in your HTML:

```html
<script language="javascript" type="text/javascript" src="../evaporate.js"></script>
```

### Integration

* [angular-evaporate](https://github.com/uqee/angular-evaporate) &mdash; AngularJS module.

## Example

```javascript
require('aws-sdk');

var config = {
     signerUrl: <SIGNER_URL>,
     aws_key: <AWS_KEY>,
     bucket: <AWS_BUCKET>,
     cloudfront: true,
     computeContentMd5: true,
     cryptoMd5Method: function (data) { return AWS.util.crypto.md5(data, 'base64'); }
};

return Evaporate.create(config)
    .then(function (evaporate) {
      
      var file = new File([""], "file_object_to_upload"),
          addConfig = {
            name: file.name,
            file: file,
            progress: function (progressValue) { console.log('Progress', progressValue); },
            complete: function (_xhr, awsKey) { console.log('Complete!'); },
          },
          overrides = {
            bucket: AWS_BUCKET // Shows that the bucket can be changed per
          };
      evaporate.add(addConfig, overrrides)
          .then(function (awsObjectKey) {
                console.log('File successfully uploaded to:', awsObjectKey);
              },
              function (reason) {
                console.log('File did not upload sucessfully:', reason);
              });
    });
```

## Configuring The AWS S3 Bucket

As of version `1.4.6`, Evaporate allows changing the bucket name for
each file. If multiple buckets are used, then each bucket must have the
correct Policies and CORS configurations applied.

1. Configure your S3 bucket, make sure your CORS settings for your S3 bucket looks similar to what is provided
   below (The PUT allowed method and the ETag exposed header are critical).

    The `DELETE` method is required to support aborting multipart uploads.

        <CORSConfiguration>
            <CORSRule>
                <AllowedOrigin>https://*.yourdomain.com</AllowedOrigin>
                <AllowedOrigin>http://*.yourdomain.com</AllowedOrigin>
                <AllowedMethod>PUT</AllowedMethod>
                <AllowedMethod>POST</AllowedMethod>
                <AllowedMethod>DELETE</AllowedMethod>
                <AllowedMethod>GET</AllowedMethod>
                <ExposeHeader>ETag</ExposeHeader>
                <AllowedHeader>*</AllowedHeader>
            </CORSRule>
        </CORSConfiguration>

2. If you are using S3 Transfer Acceleration, configure the bucket to support it as well.

3. Determine your AWS URL for your bucket. Different regions use different URLs to access S3.
   By default, Evaporate uses `https://s3.amazonaws.com`. To change the AWS Url, use
   option `aws_url`.

   Failure to use the correct AWS URL may result in CORS or other server-side failures at AWS.

4. Configure your S3 bucket Policy to support creating, resuming and aborting multi-part
   uploads. The following AWS S3 policy can act as a template.

    Replace the AWS ARNs with values that apply to your account and S3 bucket organization.

    ```json
    {
        "Version": "2012-10-17",
        "Id": "Policy145337ddwd",
        "Statement": [
            {
                "Sid": "",
                "Effect": "Allow",
                "Principal": {
                    "AWS": "arn:aws:iam::6681765859115:user/me"
                },
                "Action": [
                    "s3:AbortMultipartUpload",
                    "s3:ListMultipartUploadParts",
                    "s3:PutObject"
                ],
                "Resource": "arn:aws:s3:::mybucket/*"
            }
        ]
    }
    ```
    
    If you configure the uploader to enable the S3 existence check optimization (configuration
    option `allowS3ExistenceOptimization`), then you should add the `s3:GetObject` action to
    your bucket object statement and your S3 CORS settings must include `HEAD` method if you
    want to check for object existence on S3. Your security policies can help guide you in
    whether you want to enable this optimization or not.

    Here is an example of the bucket object policy statement that includes the required actions
    to re-use files already uploaded to S3:

    ```json
    {
        "Version": "2012-10-17",
        "Id": "Policy145337ddwd",
        "Statement": [
            {
                "Sid": "",
                "Effect": "Allow",
                "Principal": {
                    "AWS": "arn:aws:iam::6681765859115:user/me"
                },
                "Action": [
                    "s3:AbortMultipartUpload",
                    "s3:ListMultipartUploadParts",
                    "s3:GetObject",
                    "s3:PutObject"
                ],
                "Resource": "arn:aws:s3:::mybucket/*"
            }
        ]
    }
    ```
    
4. Setup a signing handler on your application server (see `signer_example.py`).
   This handler will create a signature for your multipart request that is sent
   to S3.  This handler will be contacted via AJAX on your site by evaporate.js.
   You can monitor these requests by using developer tools of most browsers.
   
   Evaporate supports using an AWS lambda for signing. The `example` folder
   contains skeleton implementations of signing handlers implemented
   in several common languages.

## Running the example application

The example application is a simple and quick way to see evaporate.js work.  There are some basic steps needed to make it run locally:

1. Install Google App Engine for Python found [here](https://developers.google.com/appengine/downloads#Google_App_Engine_SDK_for_Python) (The example app is GAE ready and it is run using the GAE dev server)

2. Set your AWS Key and S3 bucket in example/evaporate_example.html. This configuration does not use Md5 Digest verfication.

```javascript
var promise = Evaporate.create({
    signerUrl: '/sign_auth', // Do not change this in the example app
    aws_key: 'your aws_key here',
    bucket: 'your s3 bucket name here',
});
```

3. Set your AWS Secret Key in example/signing_example.py

```python
def get(self):
   to_sign = str(self.request.get('to_sign'))
   signature = base64.b64encode(hmac.new('YOUR_AWS_SECRET_KEY', to_sign, sha).digest())
   self.response.headers['Content-Type'] = "text/HTML"
   self.response.out.write(signature)
```

4. Run it! (From root of Evaporate directory). and visit 'http://localhost:8080/'

```bash
$ dev_appserver.py app.yaml
```

## API

#### Evaporate.create()

As of version 2.0, Evaporate supports the Promise interface. Instead of instantiating the Evaporate class as you would in earlier verions, use
the `create` class method of Evaporate like so:

```javascript
Evaporate.create(config)
    .then(
        function (evaporate) {
            evaporate.add(add_config)
                .then(
                    function (awsKey) { console.log('Successfully uploaded:', awsKey); },
                    function (reason) { console.log('Failed to upload:', reason); }
                )
        },
        function (reason) {
            console.log('Evaporate failed to initialize:', reason);
        });
            
```

The promise `create` returns will resolve with a reference to the fully initialized evaporate instance or reject with a reason as to why
Evaporate could not intitialize. If you use `timeUrl`, you should use the `create` method because the promise only resolves after the
time offset is available.

`config` minimally consists of `bucket` and `aws_key` and one of the
following combinations of signing options:

1. A custom `signerUrl` that returns the signture or signing response required
    for the specified `awsSignatureVersion`.
3. A custom authorization method defined with `customAuthMethod`.

`signerUrl` is not invoked if using a `customAuthMethod`. `signResponseHandler` can
also be provided for additional processing of responses from `signerUrl`. If the
request to signerUrl responds with 401 Unauthorized or 403 Permission Denied, then
the upload will stop. Any other status will attempt to retry the request.

If the custom authorization Promise rejects,then the upload will stop.

Available onfiguration options:

* **bucket**: the name of your bucket to which you want the files uploaded , for example 'my.bucket.name'. Note that
    the `cloudfront` option will determine where the bucket name appears in the `aws_url`.
* **aws_key**: your AWS key, for example 'AKIAIQC7JOOdsfsdf'
* **signerUrl**: a url on your application server which will sign the request according to your chosen AWS signature method (Version 2 or 4). For example
    'http://myserver.com/auth_upload'. When using AWS Signature Version 4, this URL must respond with the V4 signing key. If you don't want to use
    a signerURL and want to sign the request yourself, then you sign the request using `signResponseHandler`.
* **customAuthMethod**: a method that returns an implementation of
    [Promises/A+](http://promises-aplus.github.com/promises-spec/). The promise resolves with the AWS object key of the
    uploaded object. The method is passed the signParams, signHeaders, calculated string to sign and the datetime used
    in the string to sign.

    For example:

    ```javascript
    function (signParams, signHeaders, stringToSign, signatureDateTime) { // pluggable signing
        return new Promise(function (resolve, reject) {
            resolve('computed signature');
        }
    }
    ```

    Use a `customAuthMethod` if you want to use AWS Lambda for signature calculation. If the Promise rejects, then
    the file upload will stop.

* **computeContentMd5**: default=false, whether to compute and send an
    MD5 digest for each part for verification by AWS S3. This
    option defaults to `false` for backward compatibility; however, **new
    applications of Evaporate should _always_ enable this to assure
    that uploaded files are exact copies of the source (copy fidelity)**.

* **signResponseHandler**: default=null, a method that handles the XHR response with the signature. It must return the
    encoded signature. If you set this option, Evaporate will pass it the response it received from the `signerUrl`. The
    method must return a [Promise](http://promises-aplus.github.com/promises-spec/) that resolves with the signature or
    rejects with a reason. For example:

    ```javascript
    function (response, stringToSign, signatureDateTime) {
        return new Promise(function (resolve, reject) {
            resolve('computed signature');
        }
    }
    ```

* **logging**: default=true, whether Evaporate outputs to the console.log  - should be `true` or `false`
* **maxConcurrentParts**: default=5, how many concurrent file PUTs will be attempted
* **partSize**: default = 6 * 1024 * 1024 bytes, the size of the parts into which the file is broken
* **retryBackoffPower**: default=2, how aggressively to back-off on the delay between retries of a part PUT
* **maxRetryBackoffSecs**: default=300, the maximum number of seconds to wait between retries 
* **maxFileSize**: default=no limit, the allowed maximum files size, in bytes.
* **progressIntervalMS**: default=1000, the frequency (in milliseconds) at which progress events are dispatched
* **aws_url**: default='https://s3.amazonaws.com', the S3 endpoint URL. If you have a bucket in a region other than US
    Standard, you will need to change this to the correct endpoint from the 
    [AWS Region list](http://docs.aws.amazon.com/general/latest/gr/rande.html#s3_region).
    
    ##### How Evaporate Determines the Default AWS Url
    
    Evaporate will create a virutal host that includes the `bucket` when `cloudfront` is set when it creates
    the default AWS url. Evaporate always creates a virtual host with S3 transfer acceleration enabled.
    
    1. With `s3Acceleration`: `https://<bucket>.s3-accelerate.amazonaws.com`.
    2. When `awsRegion` is 'us-east-1': `https://s3.amazonaws.com`.
    3. Otherwise, for any other value like 'eu-central-1': `https://s3-eu-central-1.amazonaws.com`.

    To use a dualstack endpoint for the 'us-east-1' region, specify `aws_url` like so:
    `https://s3.dualstack.us-east-1.amazonaws.com`.
    
    Note: If you specify your own `aws_url` as an S3 virtual host, then you must also explicitly set `cloudfront`.
* **aws_key**: default=undefined, the AWS Account key to use. Required when `awsSignatureVersion` is `'4'`.
* **awsRegion**: default='us-east-1', Required when `awsSignatureVersion` is `'4'`. When set, the awsRegion will help
    determine the default aws_url to use. See notes above for `aws_url`.
* **awsSignatureVersion**: default='4', Determines the AWS Signature signing process version to use. Set this option to `'2'` for Version 2 signatures.
* **cloudfront**: default=false, When `true`, Evaporate creates an S3
    [virtual host](http://docs.aws.amazon.com/AmazonS3/latest/dev/VirtualHosting.html) format `aws_url`. For example,
    for `awsRegion` 'us-east-1', the bucket appears in the path `https://s3.amazonaws.com/<bucket>` by default but
    with `cloudfront` set, as part of the host: `https://<bucket>.s3.amazonaws.com`.
* **s3Acceleration**: default=false, whether to use [S3 Transfer Acceleration](http://docs.aws.amazon.com/AmazonS3/latest/dev/transfer-acceleration.html).
* **xhrWithCredentials**: default=false, set the XMLHttpRequest xhr object to use [credentials](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/withCredentials).
* **timeUrl**: default=undefined, a url on your application server which will return a DateTime. for example '/sign_auth/time' and return a 
    RF 2616 Date (http://www.w3.org/Protocols/rfc2616/rfc2616-sec3.html) e.g. "Tue, 01 Jan 2013 04:39:43 GMT".  See https://github.com/TTLabs/EvaporateJS/issues/74.
* **cryptoMd5Method**: default=undefined, a method that computes the MD5 digest according to https://www.ietf.org/rfc/rfc1864.txt. Only applicable when `computeContentMd5` is set.
    Method signature is `function (data) { return 'computed MD5 digest of data'; }` where `data` is a JavaScript `ArrayBuffer` representation of the part
    payload to encode. If you are using:
    - Spark MD5, the method would look like this: `function (data) { return btoa(SparkMD5.ArrayBuffer.hash(data, true)); }`.
    - AWS SDK for JavaScript: `function (data) { return AWS.util.crypto.md5(data, 'base64'); }`.
* **cryptoHexEncodedHash256**: default=undefined, a method that computes the lowercase base 16 encoded SHA256 hash. Required when `awsSignatureVersion` is `'4'`.
    - AWS SDK for JavaScript: `function (data) { return AWS.util.crypto.sha256(data, 'hex'); }`.
* **s3FileCacheHoursAgo**: default=null (no cache), whether to use the S3 uploaded cache of parts and files for ease of recovering after
    client failure or page refresh. The value should be a whole number representing the number of hours ago to check for uploaded parts
    and files. The uploaded parts and and file status are retrieved from S3. If no cache is set, Evaporate will not resume uploads after
    client or user errors. Refer to the section below for more information on this configuration option.
* **onlyRetryForSameFileName**: default=false, if the same file is uploaded again, should a retry only be attempted 
    if the file name matches the time that file name was previously uploaded. Otherwise the upload is resumed to the
    previous file name that was used.
* **allowS3ExistenceOptimization**: default=false, whether to verify file existence against S3 storage. Enabling this option requires
    that the target S3 bucket object permissions include the `s3:GetObject` action for the authorized user performing the upload. If enabled, if the uploader
    believes it is attempting to upload a file that already exists, it will perform a HEAD action on the object to verify its eTag. If this option
    is not set or if the cached eTag does not match the object's eTag, the file will be uploaded again. This option is only
    enabled if `computeContentMd5` is enabled.
* **signParams**: _Object_. an object of key/value pairs that will be passed to _all_ calls to the `signerUrl`. The
value can be a function. For example:

```javascript
signParams: {
    vip: true,
    username: function () { return user.name; }
}
```

* **signHeaders**: _Object_. an object of key/value pairs that will be passed as headers to _all_ calls to the `signerUrl`.The
value can be a function. For example:

```javascript
signHeaders: {
    xVip: 1,
    x-user-name: function () { return user.name; }
}
```

#### Evaporate.prototype.add()

`var completionPromise = evaporate.add(config[, overrideOptions])`

`config` is an object with 2 required keys:

* **name**: _String_. the S3 ObjectName that the completed file will have
* **file**: _File_. The reference to the JavaScript [File](https://developer.mozilla.org/en-US/docs/Web/API/File)
  object to upload.

  The `completionPromise` is an implementation of [Promises/A+](http://promises-aplus.github.com/promises-spec/). The 
  promise resolves with the AWS object key of the uploaded object. This object key may be different than the requested
  object key if `allowS3ExistenceOptimization` is enabled and Evaporate was able to identify the already uploaded
  object in the requested bucket. The promise rejects with a message as to why the file could not
  be uploaded.

  ```javascript
      Evaporate.create({
        bucket: 'mybucket'
      })
      .then(function (evaporate) {
        evaporate.add({
          name: 'myFile',
          file: new File()
        })
        .then(
          function (awsS3ObjectKey) {
            // "Sucessfully uploaded to: mybucket/myfile"
            console.log('Successfully uploaded to:', awsS3ObjectKey);
          },
          function (reason) {
            console.log('Failed to upload because:', reason);
          }
        );
  ```


And a number of optional parameters:

* **xAmzHeadersAtInitiate**: _Object_. an object of key/value pairs that represents the x-amz-... headers that should
  be added to the initiate multipart upload POST request. For example, some customers need to delcare an ACL like so:
  `{'x-amz-acl': 'public-read'}`.

* **notSignedHeadersAtInitiate**: _Object_. an object of key/value pairs that represents the headers that should be
  added to the initiate request but should not be included in the signing request. For example, a caching directive
  like this `{'Cache-Control': 'max-age=3600'}` should be excluded.

* **xAmzHeadersAtUpload**, **xAmzHeadersAtComplete**: _Object_. an object of key/value
  pairs that represents the x-amz-... headers that should be added to the upload PUTS and the complete POST request
  respectively. For example, `{'x-amz-security-token':'the-long-session-token'}` is needed when using temporary security
  credentials (IAM roles). If all AWS requests (excluding the initiate request) use the same headers, then
  prefer using the `xAmzHeadersCommon` option.

* **xAmzHeadersCommon**: _Object_. an object of key/value pairs that represents the x-amz-... headers that should be
  added to all AWS requests other than the initiate request. `xAmzHeadersAtUpload` and `xAmzHeadersAtComplete` do
  not need to be specified if `xAmzHeadersCommon` satisfies the AWS header requirements.

* **started**: _function(file_key)_. a function that will be called when the file upload starts. The file_key
represents the internal identifier of the file whose upload is starting.

* **paused**: _function(file_key)_. a function that will be called when the file upload is completely paused (all
in-progress parts are aborted or completed). The file_key represents the file whose upload has been paused.

* **resumed**: _function(file_key)_. a function that will be called when the file upload resumes.

* **pausing**: _function(file_key)_. a function that will be called when the file upload has been asked to pause
after all in-progress parts are completed. The file_key  represents the file whose upload has been requested
to pause.

* **cancelled**: _function()_.  a function that will be called when a successful cancel is called for an upload id.

* **complete**: _function(xhr, awsObjectKey, stats)_. a function that will be called when the file upload is complete.
    Version 1.0.0 introduced the `awsObjectKey` parameter to notify the client of the S3 object key that was used if
    the object already exists on S3.

    For information on _stats_, refer to the `progress()` callback.

* **nameChanged**: _function(awsObjectKey)_. a function that will be called when the requested AWS S3 object key changes
    because either because the requested object was previously interrupted (and is being resumed) or because the entire
    object already exists on S3.

* **info**: _function(msg)_. a function that will be called with a debug/info message, usually logged as well.

* **warn**: _function(msg)_. a function that will be called on a potentially recoverable error, and will be retried (e.g. part upload).

* **error**: _function(msg)_. a function that will be called on an irrecoverable error.

* **progress**: _function(p, stats)_. a function that will be called at a frequency determined by _progressMod_ as the file
    uploads, where _p_ is the fraction (between 0 and 1) of the file that is uploaded. Note that this number will
    increase or decrease depending on the status of uploading parts.

    _stats_ is an object that contains the unformatted and formatted transfer rate in bytes and a value approximating
    in how may seconds the upload should complete.

    ```javascript
    {
        speed: 70343222.003493043, // avgSpeedBytesPerSecond,
        readableSpeed: ,
        loaded: 7034333 // Bytes loaded since the last call
    }
    ```

* **contentType**: _String_. the content type (MIME type) the file will have

* **beforeSigner**: _function(xhr, url)_. a function that will be just before the `signUrl` is sent.

`overrideOptions`, an object, when present, will override th Evaporate global configuration options for the added file only. 
With the exception of the following options, all other Evaporate configuration options can be overridden:
 
- `maxConcurrentParts`
- `logging`
- `cloudfront`
- `encodeFilename`
- `computeContentMd5`,
- `allowS3ExistenceOptimization`
- `onlyRetryForSameFileName`
- `timeUrl`
- `cryptoMd5Method`
- `aws_key`
- `aws_url`
- `cryptoHexEncodedHash256`
- `awsRegion`
- `awsSignatureVersion`

The `.add()` method returns a Promise that resolves when the upload completes.

To pause, resume or cancel an upload, construct a file_key to pass to the respective Evaporate methods.
`file_key` is the optional file key of the upload that you want to pause. File key is constructed
as `bucket + '/' + object_name`.

#### Evaporate.prototype.pause()

`var completionPromise = evaporate.pause([file_key[, options]])`

Pauses the upload for the file identified by the object file key or all files. If options include `force`,
then the in-progress parts will be immediately aborted; otherwise, the file upload will be paused when all in-progress
parts complete. Refer to the `.paused` and `.pausing` callbacks for status feedback when pausing.

`file_key` is the optional file key of the upload that you want to pause. If `file_key` is not defined, then all
files will be paused. File key is constructed as `bucket + '/' + object_name`.

The `completionPromise` is an implementation of [Promises/A+](http://promises-aplus.github.com/promises-spec/). The 
promise resolves when the upload pauses and rejects with a message if the upload could not be fulfilled.

#### Evaporate.prototype.resume()

`var resumptionPromise = evaporate.resume([file_key])`

Resumes the upload for the file identified by the file key, or all files if the file key is not
passed. The `.resumed` callback is invoked when a file upload resumes.

`file_key` is the optional file key of the upload that you want to resume. If `file_key` is not defined, then all
files will be paused. File key is constructed as `bucket + '/' + object_name`.

The `resumptionPromise` is an implementation of [Promises/A+](http://promises-aplus.github.com/promises-spec/). The
promise resolves when the upload resumes and rejects with a message if the upload could not be resumed.

After resumption of the upload, the completion promise returned for the added file, will be resolved or rejected depending
on the final outcome of the upload.

```javascript
    Evaporate.create({
        bucket: 'mybucket'
    })
        .then(function (evaporate) {
            evaporate.add({
                name: 'myFile',
                file: new File()
            })
            .then(function (awsKey) {
                console.log('Completed', awsKey);
            });
            
            evaporate.pause('mybucket/myFile', {force: true}) // or 'evaporate.pause()' to pause all
                .then(function () {
                    console.log('Paused!');
                })
                .catch(function (reason) {
                    console.log('Failed to pause:', reason);
                };
            
            evaporate.resume('mybucket/myFile')
                .then(function () {
                    console.log('Resumed!');
                })
                .catch(function (reason) {
                    console.log('Failed to resume:', reason);
                };
        })
```
  
#### Evaporate.prototype.cancel()

`var cancellationPromise = evaporate.cancel([file_key])`

`file_key` is the optional file key of the upload that you want to cancel. If `file_key` is not defined, then all
files will be canceled. File key is constructed as `bucket + '/' + object_name`.

The completion promise rejects after the file upload aborts.

The `cancellationPromise` is an implementation of [Promises/A+](http://promises-aplus.github.com/promises-spec/). The 
promise resolves when the upload is completely canceled or rejects if the upload could not be canceled without errors.

```javascript
    Evaporate.create({
        bucket: 'mybucket'
    })
        .then(function (evaporate) {
            evaporate.add({
                name: 'myFile',
                file: new File()
            })
            .then(function (awsKey) {
                console.log('Completed', awsKey);
            },
            function (reason) {
                console.log('Did not upload', reason);
            });
            
            evaporate.cancel('mybucket/myFile')
                .then(function () {
                    console.log('Canceled!');
                });
        })
```

#### Evaporate.prototype.supported

A _Boolean_ that indicates whether the browser supports Evaporate.  

### Important Usage Notes

#### About s3FileCacheHoursAgo

When `s3FileCacheHoursAgo` is enabled, the uploader will create a small footprint of the uploaded file in `localStorage.awsUploads`. Before a
file is uploaded, this cache is queried by a key consisting of the file's name, size, mimetype and date timestamp.
It then verifies that the `partSize` used when uploading matches the partSize currenlty in use. To prevent false positives, the
upload then calcuates the MD5 digest of the first part for final verification. If you specify `onlyRetryForSameFileName`, 
then a further check is done that the specified destination file name matches the destination file name used previously.

If the uploaded file has an unfinished S3 multipart upload ID associated with it, then the uploader queries S3 for the parts that 
have been uploaded. It then uploads only the unfinished parts.

If the uploaded file has no open multipart upload, then the ETag of the last time the file was uploaded to S3 is compared to
the Etag of what is currently uploaded. If the the two ETags match, the file is not uploaded again.

The timestamp of the last time the part was uploaded is compared against the value of a `Date()` calculated as `s3FileCacheHoursAgo` ago
as a way to gauge 'freshness'. If the last upload was earlier than the number of hours specified, then the file is uploaded again.

It is still possible to have different files with the same name, size and timestamp. In this case, Evaporate calculates the checksum for the first
part and compares that to the checksum of the first part of the file to be uploaded. If they differ, the file is uploaded anew.

Note that in order to determine if the uploaded file is the same as a local file, the uploader invokes a HEAD request to S3.
The AWS S3 permissions to allow HEAD also allow GET (get object). This means that your signing url algorithm might want to not sign
GET requests. It goes without saying that your AWS IAM credentials and secrets should be protected and never shared.

#### About AWS Signature Version 4

You can use AWS Signature Version 4. The `signerUrl` response must respond with a valid V4 signature. This version of Evaporate sends the
part payload as `UNSIGNED-PAYLOAD` because we enable MD5 checksum calculations.

Be sure to configure Evaporate with `aws_key`, `awsRegion` and `cryptoHexEncodedHash256` when enabling Version 4 signatures.

[AWS Signature Version 4](http://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html) for more information.

#### AWS S3 Cleanup and Housekeeping

After you initiate multipart upload and upload one or more parts, you must either complete or abort multipart upload in order to stop
getting charged for storage of the uploaded parts. Only after you either complete or abort multipart upload, Amazon S3 frees up the parts
storage and stops charging you for the parts storage. Refer to the
[AWS Multipart Upload Overview](http://docs.aws.amazon.com/AmazonS3/latest/dev/mpuoverview.html) for more information.

The sample S3 bucket policy shown above should configure your S3 bucket to allow cleanup of orphaned multipart uploads but the cleanup task is
not part of Evaporate. A separate tool or task will need to be created to query orphaned multipart uploads and abort them using some appropriate
heuristic.

Refer to this functioning [Ruby on Rails rake task](https://github.com/bikeath1337/evaporate/blob/master/lib/tasks/cleanup.rake) for ideas.  

As of March 2016, AWS supports cleaning up multipart uploads using an S3 Lifecyle Management in which new rules are added to delete Expired and Incompletely multipart
uploads. for more information, refer to [S3 Lifecycle Management Update – Support for Multipart Uploads and Delete Markers](https://aws.amazon.com/blogs/aws/s3-lifecycle-management-update-support-for-multipart-uploads-and-delete-markers/).

#### Working with temporary credentials in Amazon EC2 instances

* [Security and S3 Multipart Upload](http://www.thoughtworks.com/mingle/infrastructure/2015/06/15/security-and-s3-multipart-upload.html)

#### Using AWS Lambda to Sign Requests

As of v2.0.0 direct support for AWS Lambda has been removed because `customAuthMethod` can be used to implement it
directly.

* Include the AWS SDK for Javascript, either directly, bower, or browserify

    <script src="https://sdk.amazonaws.com/js/aws-sdk-2.2.43.min.js"></script>

* Create a `customAuthMethod` see: [`signing_example_lambda.js`](example/signing_example_lambda.js)

  The custom authorization method should use AWS Lambda to calculate the signature. The function will receive
  the signHeaders, signParams, string to sign and datetime used to calcualte the string to sign.

* Setup an IAM user with permissions to call your lambda function. This user should be separate from the one that can
upload to S3. Here is a sample policy

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "Stmt1431709794000",
            "Effect": "Allow",
            "Action": [
                "lambda:InvokeFunction"
            ],
            "Resource": [
                "arn:aws:lambda:...:function:cw-signer"
            ]
        }
    ]
}
```
* Pass the custom auth method to Evaporate and do not specify `signerUrl`

```javascript

function authByAwsLambda (signParams, signHeaders, stringToSign, dateString) {
    return new Promise(function(resolve, reject) {
       var awsLambda = new AWS.Lambda({
          region: 'lambda region',
          accessKeyId: 'a key that can invoke the lambda function',
          secretAccessKey: 'the secret'
       })
       awsLambda.invoke({
          FunctionName: 'arn:aws:lambda:...:function:cw-signer', // arn of your lambda function
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

Evaporate.create({
    aws_key: 'your aws_key here',
    bucket: 'your s3 bucket name here',
    customAuthMethod: authByAwsLambda
 })
 .then(function (evaporate) {
       evaporate.add(...);
 });

```

### Migrating from v1.x to v2.0
Even though the changes between v1.x and v2.0 are significant, V2.0 attempts to keep the migration process simple.

#### Breaking Changes to the API

1. Instantiate Evaporate with the new [`create`](#api) class method and not with the `new` keyword. The default
   AWS Sigature Version is now 4. If you are using AWS V2 Signatures, then you must explicitly specify the signature
   when creating an Evaporate instance: `awsSignatureVersion: '2'`.
2. The [`.add()`](#evaporateprototypeadd) method now returns a Promise. Assure that your code uses the Evaporate
   instance passed when the [`Evaporate.create`](#api) resolves.
3. If your application uses [`.pause()`](#evaporateprototypepause), [`.resume()`](#evaporateprototyperesume) or
   [`.cancel()`](#evaporateprototypecancel) then you need to make sure to pass the correct file key to these methods.
   V1.6.x used the return value from `.add()` as the key to the upload to pause, resume or cancel. In v2.0 it
   returns a Promise that resolves when the upload successfully completes. To identify the file upload in these
   methods, you need to construct a file key according to the documentation of these methods.
4. If you use `awsLambda` signing, you need to use the new pluggable signing method feature (`customAuthMethod`)
   because built-in support for AWS lambda has been removed. Follow the instructions
   [here](##using-aws-lambda-to-sign-requests).
5. `signResponseHandler` now only acts on the response from `signUrl`. It cannot be used to sign a request on its own.
   To sign a request without using `signUrl`, use a pluggable signing method specifid with `customAuthMethod`.
6. If you require support for browseers that do not implement [ES6 Promises](http://people.mozilla.org/~jorendorff/es6-draft.html#sec-promise-constructor)
   (Internet Explorer), you will need to include a compliant Promise polyfill such as
   [es6-promise](https://github.com/stefanpenner/es6-promise).

#### Changes to Behavior
1. With the addition of pluggable signing methods implementing the Promise interface, it is possible for the signing
   method to reject. Previously, Evaporated treated virutally any error in the upload process as a trigger to
   (indefinitely) retry the request. As of v2.0, if the pluggable signing method rejects, the file upload will also
   reject. If you use the functionality provided through `signerUrl`, then the upload will reject if the signing
   request responds with HTTP Status 401 or 403.



Evaporate is a javascript library for uploading files from a browser to

## License

EvaporateJS is licensed under the BSD 3-Clause License
http://opensource.org/licenses/BSD-3-Clause
