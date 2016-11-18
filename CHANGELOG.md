# v2.0.0-rc.4#

- Enhances Evaporate#cancel to cancel all uploads
- Sets the defalt Signature style to V4 (V2 signature users must set `awsSignatureVersion`
- Addresses bug in Evaporate#cancel in which the evaporating count was not correctly synchronized

# v2.0.0-rc.3#

- Corrects complete callback for when reusing S3 object
- Adds new callback "nameChanged" called when the requested S3 object key
  was not used because an interrupted upload was resumed or a previously
  uploaded object was used instead.


# v2.0.0-rc.2#

- Fixes an issue where Safari hung starting an upload. Also added logic to
  detect if a part upload stalled.

# v2.0.0-rc.1#

Refer to the README file for more information on using Evaporate. This version
is a near re-write of 1.6.0. There are some changes to usage but they should
be relatively easy to apply.

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
- Adds more test coverage.

## Breaking Changes ##
- Evaporate now requires support for ES6 Promises. Use a polyfill for browsers that that don't support them.
- Instantiate Evaporate using its create class method.
- Evaporate#add no longer returns a numeric id referencing the file upload. It now
  returns a Promise when adding a file to upload. To act on the file upload, for
  example, to Pause, Resume or Cancel, use a composed key consisting of the
  bucket and object name. Refer to the README for for more information.
- Evaporate#cancel, Evaporate#pause and #Evaporate#resume now return promises
  that resolve when the action is complete, or reject with a reason.

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

