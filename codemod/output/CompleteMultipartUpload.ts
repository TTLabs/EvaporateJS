import { CancelableS3AWSRequest } from "./CancelableS3AWSRequest";

//http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadComplete.html
class CompleteMultipartUpload extends CancelableS3AWSRequest {
  constructor(fileUpload) {
    fileUpload.info("will attempt to complete upload");

    const request = {
      method: "POST",
      contentType: "application/xml; charset=UTF-8",
      path: `?uploadId=${fileUpload.uploadId}`,
      x_amz_headers:
        fileUpload.xAmzHeadersCommon || fileUpload.xAmzHeadersAtComplete,
      step: "complete"
    };

    super(fileUpload, request);
  }

  getPayload() {
    return Promise.resolve(this.fileUpload.getCompletedPayload());
  }
}
export { CompleteMultipartUpload };
