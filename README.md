Evaporate
=========

## This branch allows to use Custom port for S3 endpoint

[![Build Status](https://travis-ci.org/bikeath1337/EvaporateJS.svg?branch=master)](https://travis-ci.org/bikeath1337/EvaporateJS)
[![Code Climate](https://codeclimate.com/github/TTLabs/EvaporateJS/badges/gpa.svg)](https://codeclimate.com/github/TTLabs/EvaporateJS)

## File Upload API for AWS S3

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
- Pluggable signing methods with `customAuthMethod`. AWS Lambda functions must be implemented through this option.
- Signing methods can respond to 401 and 403 response statuses and not trigger the automatic retry feature.
- The `progress()` and `complete()` callbacks now provide upload stats like transfer rate and time remaining.
- Reduced memory footprint when calculating MD5 digests.

New Features in v2.0.5:
- Support for Node.js FileSystem (fs) ReadbleStreams. This means you can use Electron to upload a file directly from
  the file system's native File picker and avoid the usual browser restrictions.

To migrate to v2.0, [follow these instructions](https://github.com/TTLabs/EvaporateJS/wiki/Migrating-from-v1-to-v2).

## Installation

Evaporate is published as a Node module:

```bash
$ npm install evaporate
```

Otherwise, include it in your HTML:

```html
<script language="javascript" type="text/javascript" src="../evaporate.js"></script>
```

## Example

```javascript
require('crypto');

var config = {
     signerUrl: <SIGNER_URL>,
     aws_key: <AWS_KEY>,
     bucket: <AWS_BUCKET>,
     cloudfront: true,
     computeContentMd5: true,
     cryptoMd5Method: function (data) { return crypto.createHash('md5').update(data).digest('base64'); }
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
      evaporate.add(addConfig, overrides)
          .then(function (awsObjectKey) {
                console.log('File successfully uploaded to:', awsObjectKey);
              },
              function (reason) {
                console.log('File did not upload sucessfully:', reason);
              });
    });
```

See more examples on [wiki](https://github.com/TTLabs/EvaporateJS/wiki/Examples).


## API documentation

- [#create()](https://github.com/TTLabs/EvaporateJS/wiki/Evaporate.create())
- [#add()](https://github.com/TTLabs/EvaporateJS/wiki/Evaporate.prototype.add())
- [#cancel()](https://github.com/TTLabs/EvaporateJS/wiki/Evaporate.prototype.cancel())
- [#pause()](https://github.com/TTLabs/EvaporateJS/wiki/Evaporate.prototype.pause())
- [#resume()](https://github.com/TTLabs/EvaporateJS/wiki/Evaporate.prototype.resume())
- [#supported](https://github.com/TTLabs/EvaporateJS/wiki/Evaporate.prototype.supported)

Check out [Browser Compatibility](https://github.com/TTLabs/EvaporateJS/wiki/Browser-Compatibility) and [Important Usage Notes](https://github.com/TTLabs/EvaporateJS/wiki/Important-Usage-Notes) for usage details.

## Authors

  - Bobby Wallace ([bikeath1337](http://github.com/bikeath1337))
  - Tom Saffell ([tomsaffell](http://github.com/tomsaffell))

## License

EvaporateJS is licensed under the BSD 3-Clause License
http://opensource.org/licenses/BSD-3-Clause
