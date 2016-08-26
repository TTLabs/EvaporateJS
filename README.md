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
  have not been fully uploaded are resent. (`s3FileCacheHoursAgo`, `allowS3ExistenceOptimization`)
- AWS Lambda function support (`awsLambda`)
- Ability to pause and resume downloads at will

#### Browser Compatibility
EvaporteJS requires browsers that [support](http://caniuse.com/#feat=fileapi) the JavaScript File API, which includes
the `FileReader` object. The MD5 Digest support requires that FileReader support the `readAsArrayBuffer` method. For
details, look at the `supported` property of the `Evaporate` object.

## Authors

  - Tom Saffell ([tomsaffell](http://github.com/tomsaffell))
  - Bobby Wallace ([bikeath1337](http://github.com/bikeath1337))

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

var evaporate = new Evaporate({
  signerUrl: <SIGNER_URL>,
  aws_key: <AWS_KEY>,
  bucket: <AWS_BUCKET>,
  cloudfront: true,
  computeContentMd5: true,
  cryptoMd5Method: function (data) { return AWS.util.crypto.md5(data, 'base64'); }
});

var file = new File([""], "file_object_to_upload");

var file_id = evaporate.add({
        name: file.name,
        file: file,
        progress: function (progressValue) { console.log('Progress', progressValue); },
        complete: function (_xhr, awsKey) { console.log('Complete!'); },
      },
     {
        bucket: AWS_BUCKET // Shows that the bucket can be changed per
     }
);
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
var _e_ = new Evaporate({
   signerUrl: '/sign_auth', # Do not change this in the example app
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

### new Evaporate()

`var evaporate = new Evaporate(config)`

Where `config` has 3 required properties:

* **signerUrl**:  a url on your application server which will sign a string with your aws secret key. for example 'http://myserver.com/auth_upload'. When
using AWS Signature Version 4, this URL must respond with the V4 signing key.

* **aws_key**:  your aws key, for example 'AKIAIQC7JOOdsfsdf'

* **bucket**:  the name of your bucket to which you want the files uploaded , for example 'my.bucket.name'

and various configuration options:

* **logging**: default=true, whether Evaporate outputs to the console.log  - should be `true` or `false`
* **maxConcurrentParts**: default=5, how many concurrent file PUTs will be attempted
* **partSize**: default = 6 * 1024 * 1024 bytes, the size of the parts into which the file is broken
* **retryBackoffPower**: default=2, how aggressively to back-off on the delay between retries of a part PUT
* **maxRetryBackoffSecs**: default=20, the maximum number of seconds to wait between retries 
* **maxFileSize**: default=no limit, the allowed maximum files size, in bytes.
* **progressIntervalMS**: default=1000, the frequency (in milliseconds) at which progress events are dispatched
* **aws_url**: default='https://s3.amazonaws.com', the S3 endpoint URL. If you have a bucket in a region other than US Standard, you will need to change this to the correct endpoint from this list: http://docs.aws.amazon.com/general/latest/gr/rande.html#s3_region. For example, for 'Ireland' you would need 'https://s3-eu-west-1.amazonaws.com'.
* **aws_key**: default=undefined, the AWS Account key to use. Required when `awsSignatureVersion` is `'4'`.
* **awsRegion**: default=undefined, the AWS region to use, for example, 'us-east-1'. Required when `awsSignatureVersion` is `'4'`.
* **awsSignatureVersion**: default='2', Determines the AWS Signature signing process version to use. Set this option to `'4'` for Version 4 signatures.
* **cloudfront**: default=false, whether to format upload urls to upload via CloudFront. Usually requires aws_url to be something other than the default
* **s3Acceleration**: default=false, whether to use [S3 Transfer Acceleration](http://docs.aws.amazon.com/AmazonS3/latest/dev/transfer-acceleration.html).
* **xhrWithCredentials**: default=false, set the XMLHttpRequest xhr object to use [credentials](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/withCredentials).
* **timeUrl**: default=undefined, a url on your application server which will return a DateTime. for example '/sign_auth/time' and return a 
    RF 2616 Date (http://www.w3.org/Protocols/rfc2616/rfc2616-sec3.html) e.g. "Tue, 01 Jan 2013 04:39:43 GMT".  See https://github.com/TTLabs/EvaporateJS/issues/74.
* **computeContentMd5**: default=false, whether to compute and send an MD5 digest for each part for verification by AWS S3.,
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
* **awsLambda**: default=null, An AWS Lambda object, refer to [AWS Lambda](http://docs.aws.amazon.com/lambda/latest/dg/welcome.html). Refer to
    section "Using AWS Lambda to Sign Requests" below.
* **awsLambdaFunction**: default=null, The AWS ARN of your lambda function. Required when `awsLambda` has been specified.
* **signResponseHandler**: default=null, a method that handles the XHR response with the signature. It must return the `base64` encoded signature. If you
    set this option, Evaporate will pass the signature response it received from the `signerUrl` or `awsLambda` methods to your `signResponseHandler`.
    The method signature is `function (response) { return 'computed signature'; }`.

#### Evaporate#add()

`var upload_id = evaporate.add(config[, overrideOptions])`

`config` is an object with 2 required keys:

* **name**: _String_. the S3 ObjectName that the completed file will have
* **file**: _File_. The reference to the JavaScript [File](https://developer.mozilla.org/en-US/docs/Web/API/File)
  object to upload.

`overrideOptions`, when present, will override th Evaporate global configuration options for the added file only. 
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

Returns a unique upload id for the file. This id can be used in the
`.pause()`, `.resume()` and `.cancel()` methods.

The `.add()` method returns the Evaporate id of the upload to process. Use this id to abort or cancel
an upload. The id is also passed as a parameter to the `started()` callback. If the file validation passes, this method
returns an integer representing the file id, otherwise, it returns a string error message.

`config` has a number of optional parameters:

* **xAmzHeadersAtInitiate**, **xAmzHeadersAtUpload**, **xAmzHeadersAtComplete**: _Object_. an object of key/value pairs that represents the x-amz-... headers that should be added to the initiate POST, the upload PUTS, or the complete POST to S3 (respectively) and should be signed by the aws secret key. An example for initiate would be `{'x-amz-acl':'public-read'}` and for all three would be `{'x-amz-security-token':'the-long-session-token'}` which is needed when using temporary security credentials (IAM roles).

* **notSignedHeadersAtInitiate**: _Object_. an object of key/value pairs that represents the headers that should be added to the initiate POST to S3 (not added to the part PUTS, or the complete POST). An example would be `{'Cache-Control':'max-age=3600'}`

* **signParams**: _Object_. an object of key/value pairs that will be passed to _all_ calls to the `signerUrl`.

* **signHeaders**: _Object_. an object of key/value pairs that will be passed as headers to _all_ calls to the `signerUrl`.

* **started**: _function(upload_id)_. a function that will be called when the file upload starts. The upload id
represents the file whose upload is being started.

* **paused**: _function(upload_id)_. a function that will be called when the file upload is completely paused (all
in-progress parts are aborted or completed). The upload id represents the file whose upload has been paused.

* **resumed**: _function(upload_id)_. a function that will be called when the file upload resumes.

* **pausing**: _function(upload_id)_. a function that will be called when the file upload has been asked to pause
after all in-progress parts are completed. The upload id represents the file whose upload has been requested
to pause.

* **cancelled**: _function()_.  a function that will be called when a successful cancel is called for an upload id.

* **complete**: _function(xhr, awsObjectKey)_. a function that will be called when the file upload is complete.
    Version 1.0.0 introduced the `awsObjectKey` parameter to notify the client of the S3 object key that was used if
    the object already exists on S3.
* **info**: _function(msg)_. a function that will be called with a debug/info message, usually logged as well.

* **warn**: _function(msg)_. a function that will be called on a potentially recoverable error, and will be retried (e.g. part upload).

* **error**: _function(msg)_. a function that will be called on an irrecoverable error.

* **progress**: _function(p)_. a function that will be called at a frequency of _progressIntervalMS_ as the file uploads, where _p_ is the fraction (between 0 and 1) of the file that is uploaded. Note that this number will normally increase monotonically, but when a parts errors (and needs to be re-PUT) it will temporarily decrease.

* **contentType**: _String_. the content type (MIME type) the file will have

#### Evaporate#pause()

`evaporate.pause([id[, options]])`

Pauses the upload for the file identified by the upload id. If options include `force`,
then the in-progress parts will be immediately aborted; otherwise, the file upload will be paused when all in-progress
parts complete. Refer to the `.paused` and `.pausing` callbacks for status feedback when pausing.

`id` is the optional id of the upload that you want to pause. IF `id` is not defined, then all files will be paused.

#### Evaporate#resume()

`evaporate.resume([id])`

Resumes the upload for the file identified by the upload id, or all files if the id is not
passed. The `.resumed` callback is invoked when a file upload resumes.

`id` is the optional id of the upload to resume

#### Evaporate#cancel()

`evaporate.cancel(id)`

`id` is the id of the upload to cancel

#### Evaporate#supported

A _Boolean_ that indicates whether the browser supports Evaporate.

### Important Usage Notes

#### About s3FileCacheHoursAgo

When `s3FileCacheHoursAgo` is enabled, the uploader will create a small footprint of the uploaded file in `localStorage.awsUploads`. Before a
file is uploaded, this cache is queried by a key consisting of the file's name, size, mimetype and date timestamp.
It then verifies that the `partSize` used when uploading matches the partSize currenlty in use. To prevent false positives, the
upload then calcuates the MD5 digest of the first part for final verification. If you specify `onlyRetryForSameFileName`, 
then a further check is done that the specified destination file name matches the destination file name used previously.

If the uploaded file has an unfinished multipart upload ID associated with it, then the uploader queries S3 for the parts that 
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

Be sure to configure Evaporate with `aws_key`, `aws_region` and `cryptoHexEncodedHash256` when enabling Version 4 signatures.

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

You need to do a couple of things

* Include the AWS SDK for Javascript, either directly, bower, or browserify

    <script src="https://sdk.amazonaws.com/js/aws-sdk-2.2.43.min.js"></script>

* Create a lambda function see: [`signing_example_lambda.js`](example/signing_example_lambda.js)

  The Lambda function will receive three parameters to the event; `to_sign`, `sign_params` and `sign_headers`.

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
* Pass two options to the Evaporate constructor - `awsLambda` and `awsLambdaFunction`, instead of `signerUrl`

```javascript
var evaporate = new Evaporate({
    aws_key: 'your aws_key here',
    bucket: 'your s3 bucket name here',
    awsLambda:  new AWS.Lambda({
        'region': 'lambda region',
        'accessKeyId': 'a key that can invoke the lambda function',
        'secretAccessKey': 'the secret'
    }),
    awsLambdaFunction: 'arn:aws:lambda:...:function:cw-signer' // ARN of your lambda function
 });
```

## License

EvaporateJS is licensed under the BSD 3-Caluse License
http://opensource.org/licenses/BSD-3-Clause
