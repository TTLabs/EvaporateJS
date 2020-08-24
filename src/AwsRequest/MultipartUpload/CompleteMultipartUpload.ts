import { CancelableS3AWSRequest } from '../CancelableS3AWSRequest'
import { Request } from '../../Types'
import { FileUpload } from '../../FileUpload/FileUpload'

type PartialCancelableS3AWSRequest = new (
  fileUpload: FileUpload,
  request: Request
) => {
  [P in Exclude<
    keyof CancelableS3AWSRequest,
    'getPayload'
  >]: CancelableS3AWSRequest[P]
}

const PartialCancelableS3AWSRequest: PartialCancelableS3AWSRequest = CancelableS3AWSRequest

//http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadComplete.html
class CompleteMultipartUpload extends PartialCancelableS3AWSRequest {
  constructor(fileUpload: FileUpload) {
    fileUpload.info('will attempt to complete upload')

    const request: Request = {
      method: 'POST',
      contentType: 'application/xml; charset=UTF-8',
      path: `?uploadId=${fileUpload.uploadId}`,
      x_amz_headers:
        fileUpload.xAmzHeadersCommon || fileUpload.xAmzHeadersAtComplete,
      step: 'complete'
    }

    super(fileUpload, request)
  }

  getPayload(): Promise<string> {
    return Promise.resolve(this.fileUpload.getCompletedPayload())
  }
}
export { CompleteMultipartUpload }
