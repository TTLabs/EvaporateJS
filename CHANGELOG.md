# v2.1.4

## Bug Fixes ##
- Issue #377. Sends Content-Type header for all request types to address
  compatibility issue with Microsoft Edge.

# v2.1.3

## Bug Fixes ##
- Issue #375. Encodes asterisk (*) in file names to fix signature
  mismatches.

# v2.1.2

## Bug Fixes ##
- Issue #355. Addresses memory retention issue that arose in a recent Chrome update.
  Chrome was keeping a reference to the Xhr object in a system array because
  EvaporateJS was passing an XHR reference as a parameter to Promise.resolve().

# v2.1.1

## Enhancements ##
- PR #357. The progress callback response now includes more stats

## Bug Fixes ##
- Issue #356. Filenames containing "!" are now correctly encoded for S3 so that
  signatures match

# v2.1.0

## Enhancements ##
- the example html now allows the aws_key to be changed
- Improved examples for node.js

## Bug Fixes ##
- Issues #340. Resolved memory retention issue when using V2 signatures without `computeContentMd5`.

# v2.0.9

## Enhancements ##
- Issue #333. The sample page `example/evaporate_example.html` now allows
  AWS conifguration options to be temporarily stored on the page and provides
  a `customAuthMethod` backed by JavaScript. This should make it easier to
  test EvaporateJS with specific AWS settings.
- Issue #309, #312, #314. Allows AWS_URL and AWS_KEY to be overridden when a file
  is added for upload.
- Issue #320. Adds an optional localCache polyfill if localStorage is not
  available. Must be explicitly enabled with `mockLocalStorage`.
- Issue #329. A contributor provided a signing example for PHP.Laraval.

## Bug Fixes ##
- Issues #316, #325. Restores Microsoft Windows compatibilty with Edge and Google
  Chrome that broken when Evaporate started to parse URLs using the URL
  object and incorrectly use the unsupported `Object.assign` method.

# v2.0.8

## Bug Fixes ##
- Issue #300. Restores compatibility with Windows 11 by removing refernces
  to Object.assign

# v2.0.7

## Enhancements ##
- Issue #300. Signer methods and urls paramaters now enable the AWS signing
  version 4 canonical request to be passed.
- Issue #305. Adds new callback `uploadInitiated` that returns the S3 upload ID.

# v2.0.6

## Enhancements ##
- Issue #290. Improved python example for V4 signatures.

## Bug Fixes ##
- Issue #292. Corrects an issue where the override options on Evaporate#add were not properly
  applied.

# v2.0.5

## Enhancements ##
- Issue #199. Adds support for multipart uploads using Node FileSytem (fs) ReadableStreams.
  This enables intregration with Electron to upload files outside of a browser framework.

# v2.0.4

## Bug Fixes ##
- Issue #284. Memory was being retained during an upload but released on completion. Memory
  is properly managed now.

# v2.0.3

Note: tagged branch 1.6.4 is available with this fix for 1.x users. To install,

```shell
npm install git://github.com/TTLabs/EvaporateJS.git#1.6.4
```

## Bug Fixes ##
- Correctly encodes all single quotes in an S3 object name. Issue #264 (revisited)
- Simplifies internal 'casting' of ArrayBuffer to Uint8Array (ArrayBufferView)

# v2.0.2

## Enhancements ##
- Optimizes size of last part, making sure it's not reporting longer than it actually is
- Improves memory reuse of large parts
- Lazily calls getPayload for V4 signatures, not at instantiation
- Adds a sample Python signing routine for V4 signatures
- Adds recipes for using node.js `crypto` with Evaporate

# v2.0.1

## Bug Fixes ##
- Issue #277. It was possible for a queued file to not start if the previous file was canceled
  before it had started. Also addressed edge cases and race conditions when canceling a list
  of files that have been submitted. Thanks to @cvn for the test cases.

# v2.0.0

## New Features ##
- Adds upload stats to .progress and .complete callbacks. Stats include transfer rate
  in bytes/second, friendly formatted rate (Kbs, Mbs, etc.) and expected seconds to finish.
- Adds new callback "nameChanged" called when the requested S3 object key
  was not used because an interrupted upload was resumed or a previously
  uploaded object was used instead.
- Adds signing example for Go.

## Enhancements ##
- File processing is now distributed. Previously, Evaporate would upload
  one file at a time. If you uploaded 5 files, each with a total size
  less than the part size, that unused "slots" would go unused. This
  version will distribute unused slots to the next file to upload, meaning
  that Evaporate can upload several files simultaneously, up to the value
  of `maxConcurrentParts`. In other words, if `maxConcurrentParts` is 6,
  and you want to upload many files whose size is less then the part size,
  then evaporate will upload 6 files conconcurrently with each file using
  one upload "slot". Evaporate will ensure that no more than
  `maxConcurrentParts` are in play at any one time.
- Enhances Evaporate#cancel to cancel all uploads
- Documents the `beforeSigner` option for a file upload.

## Breaking Changes ##
- Evaporate now requires support for ES6 Promises. Use a polyfill for browsers that that don't support them.
- The default Signature style is now V4 (V2 signature users must set `awsSignatureVersion` explicitly)
- Instantiate Evaporate using its create class method.
- Evaporate#add no longer returns a numeric id referencing the file upload. It now
  returns a Promise when adding a file to upload. To act on the file upload, for
  example, to Pause, Resume or Cancel, use a composed key consisting of the
  bucket and object name. Refer to the README for for more information.
- Evaporate#cancel, Evaporate#pause and #Evaporate#resume now return promises
  that resolve when the action is complete, or reject with a reason.
- Makes authorization (signing) a pluggable feature and as a result, removes
  built-in support for AWS Lambda. Consequently, async methods can be used
  to calculate a signature. The custom authorization method must return
  a Promise and is specified through the `customAuthMethod` option. The
  README includes examples of how to define authorization through
  AWSLambda, as do the examples.
- Allows the upload to be aborted if the signature url responds with
  401 or 403. Additionally, if the customAuthMethod promise rejects,
  then the upload is aborted.
- `signReponseHandler` now must return a Promise. It is now only used to
  post-process a response from `signUrl`.

## Bug Fixes ##
- Evaporate was not fetching all uploaded parts from S3 if the file had
  more then 1,000 parts.

# v1.6.3#
- Corrects license name for compatibility with webjars.org.
- Addresses file.lastModifiedDate deprecation warning in FireFox

# v1.6.2#
This is a release with only changes to the readme.

# v1.6.1#

## Bug Fixes ##
- Correctly calculates the local time offset

# v1.6.0#

## Bug Fixes ##
- Issue #264, properly encodes S3 object names containing single quotes (')

# v1.5.9#

## Enhancements ##
- Adds more test coverage.

## Bug Fixes ##
- Corrects an error message that was using a 0-based index rather than 1
- Correctly aborts an upload if start() cancels the upload.
- Fixes a bug where the reported progress doubled after resuming an upload
- Fixes the ability to fetch the uploaded part count for files with more than
  1,000 uploaded parts.
- Adds safety checks for parsing the error XML from AWS responses

# v1.5.8#

## Enhancements ##
- Issue #231. Enahances the custom `signResponseHandler` method signature
  to include the stringToSign and dateString that are passed to the remote
  `signerUrl`.
- Issue #232. Adds new option `xAmzHeadersCommon` for specifying xAms
  headers for all AWS S3 requests.
- Improves test coverage further.

## Bug Fixes ##
- Issue #232, applies `xAmzHeadersCommon` to all AWS S3 requests that
  previously were lacking them.

# v1.5.7#

## Bug Fixes ##
- Issue #242, canceling an upload did not probably clear internal state,
  causing other uploads to fail silently.
- Issue #241, after being offline for a period of time, and returing
  back online, evaporate did not correctly keep track of internal state,
  causing unnecessary traffic and triggering unpredictable XHR responses.

# v1.5.6#

## Bug Fixes ##
- Issues #227, 223. Addresses all known concurrency issues

# v1.5.5#

## Bug Fixes ##
- Issue #214. Uploads on IE were failing because IE does not add a leading
slash to a file path. This has been fixed.
- Issue #222. Object key names with parentheses were not being correctly
encoded, resulting in signature mismatches.

# v1.5.4#

## Enhancements ##
- Issue #197. Allows signerUrl to be optional so that developers can
  leverage AWSLambda or signResponseHandler functions to sign
  requests.

# v1.5.3#

## Enhancements ##
- Issue #202. Defaults AWS Region to us-east-1 and correctly sets
the default AWS URL for non us-east-1 users.
- Documents that the signParams and signHeaders object
  can use functions.

## Bug Fixes ##
- Issue #205. SignatureDoesNotMatch for some parts, when
`maxConcurrentParts > 1`.
- Issue #208. Addressed Internet Explorer compatibility issue with parsing
XML error responses.
- Issue #209. Addresses when the part uploaded byte count is reset when
a part fails to upload and will be retried.

# v1.5.2#

## Enhancements ##
- Issue #191: Adds initital test framework.
- Improves the readme in response to user feedback.

## Bug Fixes ##
- Issue #203. Configuration options signParams and signHeaders were not
properly propagated the as a result, were ignored.

# v1.5.1#

## Bug Fixes ##
- Issue #196. S3 object names containing a slash '/' were being encoded,
causing the Signature V4 calculation to be wrong.

# v1.5.0#

## Enhancements ##
- Issue #17. Allows file uploads to be paused and resumed. Pausing can
be forced. In such cases, the in-progress parts are immediately aborted
and the file upload paused. Otherwise, the file is paused after all
in-progress parts have completed.
- Adds three new file callbacks: `paused`, `pausing` and `resumed`.
- The file `started` callback is now passed the upload ID of the file
being started.
- Some internal variables renamed for clarity
- Improves evaporate_example.html to exercise more features, including
MD5 checksums, pause/resume and integration with ProgressBar.

# v1.4.7#

Republished 1.4.6 as NPM had a draft version by mistake

# v1.4.6#

## Bug Fixes ##
- Issue #183. Fixes issue where V4 signature was incorrectly calculated
for URLs without a search part.

# v1.4.5#

## Enhancements ##
- Issue #179. Allows XMLHttpRequest `xhrWithCreditials` to be set.

## Bug Fixes ##
- Issue #180. Adds 'bucket' to the list of configuration options that can
be overridden in the `.add()` method.
- Issue #183. Revtored maxFileSize validation.

# v1.4.4#

## Enhancements ##
- Adds a python example.

## Bug Fixes ##
- Issue #174. Reverts changes to the documentation around the .add() method and fixes bug related to how the file is passed
to EvaporateJS.

# v1.4.3#

## Bug Fixes ##
- Issue #168. Resolves issue where the localStorage cache was not being cleaned up, resulting in a potential browser error when limits were exceeded.

# v1.4.2#

## Bug Fixes ##
- Issue #166. Resolves incorrect signuature for V2 signing on getListParts. This bug was introduced in v1.4.0.

# v1.4.1#

## Enhancements ##
- Issue #163. Adds a File callback used to indicate when Evaporate starts processing a file for upload.
- Adds a Golang example file
- Various documentation corrections

# v1.4.0#

## Enhancements ##
- Issue #61. Adds ability to change some config options when adding a file to EvaporateJS.
- Issue #71. Adds support for AWS Signature Version 4.

# v1.3.0#

## Enhancements ##
- Issue #144. Adds support for enabling AWS S3 Transfer Acceleration using the new options `s3Acceleration`.
- Issue #148. Adds support for signature processing with a custom method using `signResponseHandler`.

## Bug Fixes ##
- Issue #135: Does not throw an error on uninitiated uploads if user chooses to Cancel

# v1.2.0#

## Enhancements ##

- Issue #139. If you wish Evaporate to only upload to the AWS key specified, and disregard any previous attempts to
  upload the same file to a different key, you can now specify `onlyRetryForSameFileName`.
- Issues #41, #143. Adds a sample app.yml file for Google apps.
- Issue #136. Adds a configuration option to validate maximum uploaded file size. You can now specify `maxFileSize`.
- Issues #74, #133. Removes synchronous logic to fetch server time to resolve AWS `RequestTimeTooSkewed` response.

# v1.1.1#

## Bug Fixes ##
- Corrects XML parsing method correctly use `textContent` rather than `nodeValue`.
- Corrects JavaScript style issues

# v1.1.0#

## Features##
- Adds support for signing reqeusts using AWS Lambdas.

# v1.0.2#

## Features##
- Checks if window is defined before trying to access the window object in `supported`. EvaporateJS can now sucesfully be imported into a node.js environment.
- Adds an example using AWS SDK for Javascript for the `cryptoMd5Method` configuration option.

## Bug Fixes##

- Issue #124. Only enables the history cache if MD5 checksums are also enabled.

# v1.0.1#

## Features##
- Issue #117. Adds the signParams configuration to the localStorage cache for reuse when resuming uploads

## Bug Fixes##
- Issue #116. Fixes issue where the uploader would fail because localStorage is not available in incognito mode on some browsers
- Issue #115. Fixes an issue where the uploader assumed that a Blob object had a last modified date

# v1.0.0#

##Features##
- Adds MD5 checksum/digest validation, Issue #96.
- Adds ability to Abort a multipart upload (releasing AWS S3 resources), Issue #98. This change requires S3 CORS Settings
  to allow the DELETE method.
- Adds retry logic to the Initiate and Complete methods, Issue #107
- Adds ability to resume uploads, even after client or user error, Issue #104. Using this feature requires S3 CORS Settings
  to allow the HEAD method. Refer to the updated README.md for more information on the necessary bucket policy.

## Breaking Changes##
- The `complete` callback method signature has changes: a new parameter has been added `awsObjectKey` which will contain the S3 object key found
when attempting to resume uploads after client failure. This is required because it is generally required to create a randomingly unique S3 object key
to prevent namespace clashes in multi-user environments. If an object can be resued, the proposed AWS S3 object key would not be used; instead, the object key of
existing object would be required.

##Fixes##
- Addresses memory leak when retrying by releasing finished, failed or aborted XMLHttpRequest objects, Issue #100.

