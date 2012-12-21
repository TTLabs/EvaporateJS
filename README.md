EvaporateJS
===========

Javascript library for browser to S3 multipart resumable uploads

This is an early-alpha release. It still needs lots more work and testing.


##Set up EvaporateJS


1. include evaporate.js in your page (see `example.html`)

2. setup your S3 bucket (see `s3_cors_example.xml`)

3. setup a signing handler on your application server (see `signer_example.py`)



##Use EvaporateJS


So far the api contains just two methods, and one property

###new Evaporate()

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


###.add()

`evap.add(config)`

`config` has 2 required parameters:

* **name**: _String_. the S3 ObjectName that the completed file will have
* **file**: _File_. a reference to the file object

`config` has 4 optional parameter:


* **xAmzHeadersAtInitiate**: _Object_. an object of key/value pairs that represents the x-amz-... headers that should be added to the initiate POST to S3 (not added to the part PUTS, or the complete POST). An example would be `{'x-amz-acl':'public-read'}`

* **signParams**: _Object_. an object of key/value pairs that will be passed to _all_ calls to the signerUrl. 

* **complete**: _function()_. a function that will be called when the file upload is complete

* **progress**: _function(p)_. a function that will be called at a frequency of _progressIntervalMS_ as the file uploads, where _p_ is the fraction (between 0 and 1) of the file that is uploaded. Note that this number will normally increase monotonically, but in the case that one or more parts fails and need to be rePUT, it may go also decrease.


###.supported

The `supported` property is _Boolean_, and indicates whether the browser has the capabilities required for Evaporate to work. Needs more testing.      
