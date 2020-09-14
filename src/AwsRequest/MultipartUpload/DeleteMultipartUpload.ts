import { SignedS3AWSRequest } from '../SignedS3AWSRequest'
import { Global } from '../../Global'
import { EVAPORATE_STATUS } from '../../Evaporate/EvaporateStatusEnum'
import { Request } from '../../Types'

const maxRetries = 1

//http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadAbort.html
class DeleteMultipartUpload extends SignedS3AWSRequest {
  constructor(fileUpload) {
    fileUpload.info('will attempt to abort the upload')
    fileUpload.abortParts()

    const request: Request = {
      method: 'DELETE',
      path: `?uploadId=${fileUpload.uploadId}`,
      x_amz_headers: fileUpload.xAmzHeadersCommon,
      success404: true,
      step: 'abort'
    }

    super(fileUpload, request)
  }

  success(): void {
    this.fileUpload.setStatus(EVAPORATE_STATUS.ABORTED)
    this.awsDeferred.resolve(this.currentXhr)
  }

  errorHandler(reason): boolean {
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
