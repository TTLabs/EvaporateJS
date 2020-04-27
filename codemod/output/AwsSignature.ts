class AwsSignature {
  request: any
  awsRequest: any
  con: any

  constructor(awsRequest) {
    this.awsRequest = awsRequest
    this.request = awsRequest.request
    this.con = awsRequest.fileUpload.con
  }

  error() {}
  authorizationString() {}
  stringToSign() {}
  canonicalRequest() {}
  setHeaders(xhr: XMLHttpRequest) {}

  datetime(timeOffset) {
    return new Date(new Date().getTime() + timeOffset)
  }

  dateString(timeOffset) {
    return `${this.datetime(timeOffset)
      .toISOString()
      .slice(0, 19)
      .replace(/-|:/g, '')}Z`
  }
}
AwsSignature.prototype.request = {}
export { AwsSignature }
