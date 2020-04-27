import { SignedS3AWSRequestWithRetryLimit } from './SignedS3AWSRequestWithRetryLimit'

//http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadComplete.html
class ReuseS3Object extends SignedS3AWSRequestWithRetryLimit {
  public awsKey: any

  constructor(fileUpload, awsKey) {
    const request = {
      method: 'HEAD',
      path: '',
      x_amz_headers: fileUpload.xAmzHeadersCommon,
      success404: true,
      step: 'head_object'
    }

    super(fileUpload, request)
    this.awsKey = awsKey
    fileUpload.info('will attempt to verify existence of the file')
  }

  success() {
    const eTag = this.currentXhr.getResponseHeader('Etag')

    if (
      eTag !== this.fileUpload.eTag &&
      !this.rejectedSuccess(
        'uploadId ',
        this.fileUpload.id,
        " found on S3 but the Etag doesn't match."
      )
    ) {
      return
    }

    this.awsDeferred.resolve(this.currentXhr)
  }
}
ReuseS3Object.prototype.awsKey = undefined
export { ReuseS3Object }
