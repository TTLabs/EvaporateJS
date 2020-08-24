import { CancelableS3AWSRequest } from '../CancelableS3AWSRequest'
import { Global } from '../../Global'
import { Request } from '../../Types'
import { FileUpload } from '../../FileUpload/FileUpload'

// see: http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadInitiate.html
class InitiateMultipartUpload extends CancelableS3AWSRequest {
  public awsKey: string

  constructor(fileUpload: FileUpload, awsKey: string) {
    const request: Request = {
      method: 'POST',
      path: '?uploads',
      step: 'initiate',
      x_amz_headers: fileUpload.xAmzHeadersAtInitiate,
      not_signed_headers: fileUpload.notSignedHeadersAtInitiate,
      response_match: '<UploadId>(.+)</UploadId>'
    }

    super(fileUpload, request)
    this.awsKey = awsKey
  }

  success(): void {
    const match = this.currentXhr.response.match(
      new RegExp(this.request.response_match)
    )
    this.fileUpload.uploadId = match[1]
    this.fileUpload.awsKey = this.awsKey
    Global.l.d('InitiateMultipartUpload ID is', this.fileUpload.uploadId)
    this.fileUpload.createUploadFile()
    this.awsDeferred.resolve(this.currentXhr)
  }
}
export { InitiateMultipartUpload }
