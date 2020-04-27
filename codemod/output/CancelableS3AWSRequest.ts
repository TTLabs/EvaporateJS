import { SignedS3AWSRequest } from './SignedS3AWSRequest'
import { ABORTED, CANCELED } from './Constants'

class CancelableS3AWSRequest extends SignedS3AWSRequest {
  errorExceptionStatus() {
    return [ABORTED, CANCELED].includes(this.fileUpload.status)
  }
}
export { CancelableS3AWSRequest }
