EvaporateJS
===========

EvaporateJS is a javascript library for directly uploading files from a web browser to AWS S3, using S3's multipart upload. 

### Why?
EvaporateJS can resume an upload after a problem without having to start again at the beginning. For example, let's say you're uploading a 1000MB file, you've uploaded the first 900MBs, and then there is a problem on the network. Normally at this point you'd have to restart the upload from the beginning. Not so with EvaporateJS - it will only redo a small ~5MB chunk of the file, and then carry on from where it left off, and upload the final 100MB.     

This is an beta release. It still needs lots more work and testing, but we do use it in production on videopixie.com, and we've seen it upload 100GB+ files.


## Set up EvaporateJS


1. Include evaporate.js in your page

     <script language="javascript" type="text/javascript" src="../evaporate.js"></script>

2. Setup your S3 bucket, make sure your CORS settings for your S3 bucket looks similar to what is provided below (The PUT allowed method and the ETag exposed header are critical).

        <CORSConfiguration>
            <CORSRule>
                <AllowedOrigin>https://*.yourdomain.com</AllowedOrigin>
                <AllowedOrigin>http://*.yourdomain.com</AllowedOrigin>
                <AllowedMethod>PUT</AllowedMethod>
                <AllowedMethod>POST</AllowedMethod>
                <AllowedMethod>DELETE</AllowedMethod>
                <ExposeHeader>ETag</ExposeHeader>
                <AllowedHeader>*</AllowedHeader>
            </CORSRule>
        </CORSConfiguration>

3. Setup a signing handler on your application server (see `signer_example.py`).  This handler will create a signature for your multipart request that is sent to S3.  This handler will be contacted via AJAX on your site by evaporate.js. You can monitor these requests by running the sample app locally and using the Chrome Web inspector.


## Running the example application

The example application is a simple and quick way to see evaporate.js work.  There are some basic steps needed to make it run locally:

1. Install Google App Engine for Python found [here](https://developers.google.com/appengine/downloads#Google_App_Engine_SDK_for_Python) (The example app is GAE ready and it is run using the GAE dev server)

2. Set your AWS Key and S3 bucket in example/evaporate_example.html


        var _e_ = new Evaporate({
           signerUrl: '/sign_auth', # Do not change this in the example app
           aws_key: 'your aws_key here',
           bucket: 'your s3 bucket name here',
        });

3. Set your AWS Secret Key in example/signing_example.py

        def get(self):
           to_sign = str(self.request.get('to_sign'))
           signature = base64.b64encode(hmac.new('YOUR_AWS_SECRET_KEY', to_sign, sha).digest())
           self.response.headers['Content-Type'] = "text/HTML"
           self.response.out.write(signature)

4. Run it! (From root of Evaporate directory). and visit 'http://localhost:8080/'

        $ dev_appserver.py app.yaml

5. Upload a file then visit the bucket you specified on the S3 Console page, it will appear there!

## Use EvaporateJS


So far the api contains just two methods, and one property

### new Evaporate()

`var evap = new Evaporate(config)`


`config` has 3 required properties

* **signerUrl**:  a url on your application server which will sign a string with your aws secret key. for example 'http://myserver.com/auth_upload'

* **aws_key**:  your aws key, for example 'AKIAIQC7JOOdsfsdf'

* **bucket**:  the name of your bucket to which you want the files uploaded , for example 'my.bucket.name'


`config` has some optional parameters

* **logging**: default=true, whether EvaporateJS outputs to the console.log  - should be `true` or `false`
* **maxConcurrentParts**: default=5, how many concurrent file PUTs will be attempted
* **partSize**: default = 6 * 1024 * 1024 bytes, the size of the parts into which the file is broken
* **retryBackoffPower**: default=2, how aggresively to back-off on the delay between retries of a part PUT
* **maxRetryBackoffSecs**: default=20, the maximum number of seconds to wait between retries 
* **progressIntervalMS**: default=1000, the frequency (in milliseconds) at which progress events are dispatched
* **aws_url**: default='https://s3.amazonaws.com', the S3 endpoint URL
* **cloudfront**: default=false, whether to format upload urls to upload via CloudFront. Usually requires aws_url to be something other than the default

### .add()

`evap.add(config)`

`config` has 2 required parameters:

* **name**: _String_. the S3 ObjectName that the completed file will have
* **file**: _File_. a reference to the file object

`config` has 8 optional parameter:


* **xAmzHeadersAtInitiate**, **xAmzHeadersAtUpload**, **xAmzHeadersAtComplete**: _Object_. an object of key/value pairs that represents the x-amz-... headers that should be added to the initiate POST, the upload PUTS, or the complete POST to S3 (respectively) and should be signed by the aws secret key. An example for initiate would be `{'x-amz-acl':'public-read'}` and for all three would be `{'x-amz-security-token':'the-long-session-token'}` which is needed when using temporary security credentials (IAM roles).

* **notSignedHeadersAtInitiate**: _Object_. an object of key/value pairs that represents the headers that should be added to the initiate POST to S3 (not added to the part PUTS, or the complete POST). An example would be `{'Cache-Control':'max-age=3600'}`

* **signParams**: _Object_. an object of key/value pairs that will be passed to _all_ calls to the signerUrl. 

* **complete**: _function()_. a function that will be called when the file upload is complete.
 
* **cancelled**: _function()_.  a function that will be called when a successful cancel is called for an upload id.

* **info**: _function(msg)_. a function that will be called with a debug/info message, usually logged as well.

* **warn**: _function(msg)_. a function that will be called on a potentially recoverable error, and will be retried (e.g. part upload).

* **error**: _function(msg)_. a function that will be called on an irrecoverable error.

* **progress**: _function(p)_. a function that will be called at a frequency of _progressIntervalMS_ as the file uploads, where _p_ is the fraction (between 0 and 1) of the file that is uploaded. Note that this number will normally increase monotonically, but when a parts errors (and needs to be re-PUT) it will temporarily decrease.

* **contentType**: _String_. the content type (MIME type) the file will have

### .cancel()
`evap.cancel(id)`

`id` is the id of the upload that you want to cancel

### .supported

The `supported` property is _Boolean_, and indicates whether the browser has the capabilities required for Evaporate to work. Needs more testing.  


## Integration

* [angular-evaporate](https://github.com/uqee/angular-evaporate) &mdash; AngularJS module.
* 

## License

EvaporateJS is licensed under the BSD 3-Caluse License
http://opensource.org/licenses/BSD-3-Clause

## Working with temporary credentials in Amazon EC2 instances

* [Security and S3 Multipart Upload](http://www.thoughtworks.com/mingle/infrastructure/2015/06/15/security-and-s3-multipart-upload.html)
