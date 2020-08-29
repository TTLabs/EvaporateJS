# Evaporate

**A Complete File Upload API for AWS S3**

Evaporate is a JS library for uploading files from a browser to
AWS S3, using parallel S3's multipart uploads with MD5 checksum support
and control over pausing / resuming the upload.

[![Build Status](https://travis-ci.org/bikeath1337/EvaporateJS.svg?branch=master)](https://travis-ci.org/bikeath1337/EvaporateJS)
[![Code Climate](https://codeclimate.com/github/TTLabs/EvaporateJS/badges/gpa.svg)](https://codeclimate.com/github/TTLabs/EvaporateJS)

**Table of Contents**

- [Help us test our v3!](#help-us-test-our-v3)
- [Features](#features)
  - [Configurable](#configurable)
  - [Resilient](#resilient)
  - [Performant](#performant)
  - [Monitorable](#monitorable)
  - [Cross Platform](#cross-platform)
- [Installation](#installation)
- [API & Usage](#api--usage)
- [Authors](#authors)
- [Maintainers](#maintainers)
- [Contributing](#contributing)
- [License](#license)

## Help us test our v3!

We're in the final stages of migrating the library to Typescript and Webpack, and we're doing it to increase the maintainability of the project, but we also had reports of increased performance and lower memory usage!

The new version will foster an increase in the ease of contributing and onboarding of new maintainers.

But don't worry, as there were no contract changes, if you're using our `v2` it should work out of the box.

To test it, it's very simple, you just have to install the library like this:

```bash
npm install evaporate@TTLabs/EvaporateJS#pull/448/head
```

And that's it! It should immediately work. If you have some feedback about it, please [post it here](https://github.com/TTLabs/EvaporateJS/pull/448).

## Features

### Configurable

- Configurable number of parallel uploads for each part (`maxConcurrentParts`)

- Configurable MD5 Checksum calculations and handling for each uploaded
  part (`computeContentMd5`)

- Pluggable signing methods with `customAuthMethod` to support AWS Lambda, async functions and more.

### Resilient

- S3 Transfer Acceleration (`s3Acceleration`)

- Robust recovery when uploading huge files. Only parts that
  have not been fully uploaded again. (`s3FileCacheHoursAgo`, `allowS3ExistenceOptimization`)

- Ability to pause and resume downloads at will

- Signing methods can respond to 401 and 403 response statuses and not trigger the automatic retry feature.

- AWS Signature Version 2 and 4 (`awsSignatureVersion`)

### Performant

- Reduced memory footprint when calculating MD5 digests.

- Parallel file uploads while respecting `maxConcurrentParts`.

- If Evaporate reuses an interrupted upload or avoids uploading a file that is already available on S3, the new
  callback `nameChanged` will be invoked with the previous object name at the earliest moment. This indicates
  that requested object name was not used.

### Monitorable

- The `progress()` and `complete()` callbacks provide upload stats like transfer rate and time remaining.

- Pause, Resume, Cancel can act on all in-progress file uploads

### Cross Platform

- Support for Node.js FileSystem (fs) ReadbleStreams. This means you can use Electron to upload a file directly from
  the file system's native File picker and avoid the usual browser restrictions.

## Installation

```bash
$ npm install evaporate
```

## API & Usage

The documentation for the usage of the whole API is [available here](https://github.com/TTLabs/EvaporateJS/wiki/API).

This is a simple example of how you can configure it:

```javascript
const Evaporate = require('EvaporateJS');
const Crypto = require('crypto');

const config = {
  signerUrl: SIGNER_URL,
  aws_key: AWS_KEY,
  bucket: AWS_BUCKET,
  cloudfront: true,
  computeContentMd5: true,
  cryptoMd5Method: data => Crypto
  .createHash('md5')
  .update(data)
  .digest('base64');
};

const uploadFile = evaporate => {
  const file = new File([""], "file_object_to_upload");

  const addConfig = {
    name: file.name,
    file: file,
    progress: progressValue => console.log('Progress', progressValue),
    complete: (_xhr, awsKey) => console.log('Complete!'),
  }

  /*
    The bucket and some other properties
    can be changed per upload
  */

  const overrides = {
    bucket: AWS_BUCKET_2
  };

  evaporate.add(addConfig, overrides)
    .then(
      awsObjectKey =>
        console.log('File successfully uploaded to:', awsObjectKey),
      reason =>
        console.log('File did not upload sucessfully:', reason);
    )
}

return Evaporate.create(config).then(uploadFile);
```

More examples are available [here](https://github.com/TTLabs/EvaporateJS/wiki/Examples).

Don't forget to check out the [Browser Compatibility](https://github.com/TTLabs/EvaporateJS/wiki/Browser-Compatibility) and [Important Usage Notes](https://github.com/TTLabs/EvaporateJS/wiki/Important-Usage-Notes) pages for usage details.

## Authors

- Bobby Wallace - [@bikeath1337](http://github.com/bikeath1337)
- Tom Saffell - [@tomsaffell](http://github.com/tomsaffell)

## Maintainers

- Jakub Zitny - [@jakubzitny](http://github.com/jakubzitny)
- Matheus Moreira - [@mattmoreira](http://github.com/mattmoreira)

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

This package is licensed under the [BSD 3-Clause](http://opensource.org/licenses/BSD-3-Clause) license
