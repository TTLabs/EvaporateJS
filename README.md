EvaporateJS
===========

Javascript library for browser to S3 multipart resumable uploads

This is an early-alpha release. It still needs lots more work and testing.


Set up EvaporateJS
------------------

1. include evaporate.js in your page (see example.html)

2. setup your S3 bucket (see s3_cors_example.xml)

3. setup a signing handler on your application server (see signer_example.py)



Use EvaporateJS
-------------

So far the are only two methods:

Instantiate 

`var evap = new Evaporate(config)`


Config has 3 required properties

* **signerUrl**:  a url on your application server which will sign a string with your aws secret key. for example 'http://myserver.com/auth_upload'

* **aws_key**:  your aws key, for example 'AKIAIQC7JOOdsfsdf'

* **bucket**:  the name of your bucket to which you want the files uploaded , for example 'my.bucket.name'


Config has some optional parameters

* **logging**: whether EvaporateJS outputs to the console.log  - should be `true` or `false`
* **maxConcurrentParts**: 5
* **partSize**: 6 * 1024 * 1024
* **retryBackoffPower**: 2
* **maxRetryBackoffSecs**: 20
* **progressIntervalMS**: 1000



