import { CancelableS3AWSRequest } from "./CancelableS3AWSRequest";
import { Global } from "./Global";

class SignedS3AWSRequestWithRetryLimit extends CancelableS3AWSRequest {
	public maxRetries: any;

  constructor(fileUpload, request?: any, maxRetries?: number) {
    super(fileUpload, request);

    if (maxRetries > -1) {
      this.maxRetries = maxRetries;
    }
  }

  errorHandler(reason) {
    if (this.attempts > this.maxRetries) {
      const msg = [
        "MaxRetries exceeded. Will re-upload file id ",
        this.fileUpload.id,
        ", ",
        reason
      ].join("");

      Global.l.w(msg);
      this.awsDeferred.reject(msg);
      return true;
    }
  }

  rejectedSuccess(...args) {
    const reason = Array.prototype.slice.call(args, 1).join("");
    this.awsDeferred.reject(reason);
    return false;
  }
}
SignedS3AWSRequestWithRetryLimit.prototype.maxRetries = 1;
export { SignedS3AWSRequestWithRetryLimit };
