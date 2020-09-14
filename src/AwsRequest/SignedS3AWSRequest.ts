import { Global } from '../Global'
import { EVAPORATE_STATUS } from '../Evaporate/EvaporateStatusEnum'
import {
  defer,
  awsUrl,
  uri,
  extend,
  signingVersion,
  getAwsResponse,
  authorizationMethod
} from '../Utils'
import { FileUpload } from '../FileUpload/FileUpload'

import { AwsSignatureV2 } from '../AwsSignature/AwsSignatureV2'
import { AwsSignatureV4 } from '../AwsSignature/AwsSignatureV4'
import { Defer, Request, Dictionary } from '../Types'
import { EvaporateConfigInterface } from '../Evaporate/EvaporateConfigInterface'

class SignedS3AWSRequest {
  public fileUpload: FileUpload
  public con: EvaporateConfigInterface
  public attempts: number = 1
  public localTimeOffset: number = 0
  public awsDeferred: Defer<XMLHttpRequest>
  public started: Defer<string>
  public awsUrl: string
  public awsHost: string
  public request: Request
  public signer: AwsSignatureV2 | AwsSignatureV4
  public currentXhr: XMLHttpRequest
  public payloadPromise: Promise<Uint8Array | ArrayBuffer | string | []>

  constructor(fileUpload: FileUpload, request?: Request) {
    this.fileUpload = fileUpload
    this.con = fileUpload.con
    this.localTimeOffset = this.fileUpload.localTimeOffset
    this.awsDeferred = defer()
    this.started = defer()
    this.awsUrl = awsUrl(this.con)
    this.awsHost = uri(this.awsUrl).hostname
    const r = extend({}, request) as Request

    if (fileUpload.contentType) {
      r.contentType = fileUpload.contentType
    }

    this.updateRequest(r)
  }

  getPath(): string {
    let path = `/${this.con.bucket}/${this.fileUpload.name}`

    if (this.con.cloudfront || this.awsUrl.includes('cloudfront')) {
      path = `/${this.fileUpload.name}`
    }

    return path
  }

  updateRequest(request: Request): void {
    this.request = request
    this.signer = signingVersion(this)
  }

  success(): void {
    this.awsDeferred.resolve(this.currentXhr)
  }

  backOffWait(): number {
    return this.attempts === 1
      ? 0
      : 1000 *
          Math.min(
            this.con.maxRetryBackoffSecs,
            this.con.retryBackoffPower ** (this.attempts - 2)
          )
  }

  error(reason: string): void {
    if (this.errorExceptionStatus()) {
      return
    }

    this.signer.error()
    Global.l.d(this.request.step, 'error:', this.fileUpload.id, reason)

    if (typeof this.errorHandler(reason) !== 'undefined') {
      return
    }

    this.fileUpload.warn('Error in ', this.request.step, reason)
    this.fileUpload.setStatus(EVAPORATE_STATUS.ERROR)
    const self = this
    const backOffWait = this.backOffWait()
    this.attempts += 1

    setTimeout(() => {
      if (!self.errorExceptionStatus()) {
        self.trySend()
      }
    }, backOffWait)
  }

  errorHandler(reason) {}

  errorExceptionStatus(): boolean {
    return false
  }

  getPayload(): Promise<void> {
    return Promise.resolve(null)
  }

  success_status(xhr: XMLHttpRequest): boolean {
    return (
      (xhr.status >= 200 && xhr.status <= 299) ||
      (this.request.success404 && xhr.status === 404)
    )
  }

  stringToSign(): string {
    return encodeURIComponent(this.signer.stringToSign())
  }

  canonicalRequest(): string {
    return this.signer.canonicalRequest()
  }

  signResponse(
    payload,
    stringToSign: string,
    signatureDateTime: string
  ): Promise<string> {
    const self = this

    return new Promise(resolve => {
      if (typeof self.con.signResponseHandler === 'function') {
        return self.con
          .signResponseHandler(payload, stringToSign, signatureDateTime)
          .then(resolve)
      }

      resolve(payload)
    })
  }

  sendRequestToAWS(): Promise<string> {
    const self = this

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      self.currentXhr = xhr
      let url = [self.awsUrl, self.getPath(), self.request.path].join('')
      const all_headers: Dictionary<string> = {}

      if (self.request.query_string) {
        url += self.request.query_string
      }

      extend(all_headers, self.request.not_signed_headers)
      extend(all_headers, self.request.x_amz_headers)

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (self.success_status(xhr)) {
            if (
              self.request.response_match &&
              xhr.response.match(new RegExp(self.request.response_match)) ===
                undefined
            ) {
              reject(
                `AWS response does not match set pattern: ${self.request.response_match}`
              )
            } else {
              resolve()
            }
          } else {
            let reason = xhr.responseText ? getAwsResponse(xhr) : ' '
            reason += `status:${xhr.status}`
            reject(reason)
          }
        }
      }

      xhr.open(self.request.method, url)
      xhr.setRequestHeader('Authorization', self.signer.authorizationString())

      for (const key in all_headers) {
        if (all_headers.hasOwnProperty(key)) {
          xhr.setRequestHeader(key, all_headers[key])
        }
      }

      self.signer.setHeaders(xhr)

      if (self.request.contentType) {
        xhr.setRequestHeader('Content-Type', self.request.contentType)
      }

      if (self.request.md5_digest) {
        xhr.setRequestHeader('Content-MD5', self.request.md5_digest)
      }

      xhr.onerror = (ev: ProgressEvent) => {
        const reason = xhr.responseText
          ? getAwsResponse(xhr)
          : 'transport error'
        reject(reason)
      }

      if (typeof self.request.onProgress === 'function') {
        xhr.upload.onprogress = self.request.onProgress
      }

      self.getPayload().then(xhr.send.bind(xhr), reject)

      setTimeout(() => {
        // We have to delay here or Safari will hang
        self.started.resolve(`request sent ${self.request.step}`)
      }, 20)

      self.signer.payload = null
      self.payloadPromise = undefined
    })
  }

  //see: http://docs.amazonwebservices.com/AmazonS3/latest/dev/RESTAuthentication.html#ConstructingTheAuthenticationHeader
  authorize(): Promise<string> {
    this.request.dateString = this.signer.dateString(this.localTimeOffset)

    this.request.x_amz_headers = extend(this.request.x_amz_headers, {
      'x-amz-date': this.request.dateString
    }) as Dictionary<string>

    return this.signer
      .getPayload()
      .then(() => authorizationMethod(this).authorize())
  }

  authorizationSuccess(authorization: string): void {
    Global.l.d(this.request.step, 'signature:', authorization)
    this.request.auth = authorization
  }

  trySend(): Promise<void> {
    const self = this

    return this.authorize().then((value: string) => {
      self.authorizationSuccess(value)

      if (self.fileUpload.status === EVAPORATE_STATUS.ABORTED) {
        return
      }

      self
        .sendRequestToAWS()
        .then(self.success.bind(self), self.error.bind(self))
    }, self.error.bind(self))
  }

  send(): Promise<XMLHttpRequest> {
    this.trySend()
    return this.awsDeferred.promise
  }
}

export { SignedS3AWSRequest }
