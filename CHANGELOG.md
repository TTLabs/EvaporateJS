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

