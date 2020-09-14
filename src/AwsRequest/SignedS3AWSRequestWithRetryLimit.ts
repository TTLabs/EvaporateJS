import { CancelableS3AWSRequest } from './CancelableS3AWSRequest'
import { Global } from '../Global'
import { Request } from '../Types'
import { FileUpload } from '../FileUpload/FileUpload'

class SignedS3AWSRequestWithRetryLimit extends CancelableS3AWSRequest {
  public maxRetries: number = 1

  constructor(fileUpload: FileUpload, request?: Request, maxRetries?: number) {
    super(fileUpload, request)

    if (maxRetries > -1) {
      this.maxRetries = maxRetries
    }
  }

  errorHandler(reason: string): boolean {
    if (this.attempts > this.maxRetries) {
      const msg = [
        'MaxRetries exceeded. Will re-upload file id ',
        this.fileUpload.id,
        ', ',
        reason
      ].join('')

      Global.l.w(msg)
      this.awsDeferred.reject(msg)
      return true
    }
  }

  rejectedSuccess(...args: Array<string>): boolean {
    const reason = Array.prototype.slice.call(args, 1).join('')
    this.awsDeferred.reject(reason)
    return false
  }
}

export { SignedS3AWSRequestWithRetryLimit }
