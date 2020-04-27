import { SignedS3AWSRequest } from './SignedS3AWSRequest'
import { Global } from './Global'
import { ABORTED } from './Constants'

const maxRetries = 1

//http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadAbort.html
class DeleteMultipartUpload extends SignedS3AWSRequest {
  constructor(fileUpload) {
    fileUpload.info('will attempt to abort the upload')
    fileUpload.abortParts()

    const request = {
      method: 'DELETE',
      path: `?uploadId=${fileUpload.uploadId}`,
      x_amz_headers: fileUpload.xAmzHeadersCommon,
      success404: true,
      step: 'abort'
    }

    super(fileUpload, request)
  }

  success() {
    this.fileUpload.setStatus(ABORTED)
    this.awsDeferred.resolve(this.currentXhr)
  }

  errorHandler(reason) {
    if (this.attempts > maxRetries) {
      const msg = `Error aborting upload, Exceeded retries deleting the file upload: ${reason}`
      Global.l.w(msg)
      this.fileUpload.error(msg)
      this.awsDeferred.reject(msg)
      return true
    }
  }
}

export { DeleteMultipartUpload }
