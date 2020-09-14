import { EvaporateConfigInterface } from '../Evaporate/EvaporateConfigInterface'
import { Request } from '../Types'
import { SignedS3AWSRequest } from '../AwsRequest/SignedS3AWSRequest'
import { PutPart } from '../AwsRequest/PutPart'
import { CompleteMultipartUpload } from '../AwsRequest/MultipartUpload/CompleteMultipartUpload'

class AwsSignature {
  request: Request
  awsRequest: SignedS3AWSRequest | PutPart | CompleteMultipartUpload
  con: EvaporateConfigInterface
  payload: ArrayBuffer

  constructor(awsRequest) {
    this.awsRequest = awsRequest
    this.request = awsRequest.request
    this.con = awsRequest.fileUpload.con
  }

  error() {}
  authorizationString() {}
  stringToSign() {}
  canonicalRequest() {
    return ''
  }

  setHeaders(xhr: XMLHttpRequest) {}

  datetime(timeOffset: number): Date {
    return new Date(new Date().getTime() + timeOffset)
  }

  dateString(timeOffset: number): string {
    return `${this.datetime(timeOffset)
      .toISOString()
      .slice(0, 19)
      .replace(/-|:/g, '')}Z`
  }
}

export { AwsSignature }
