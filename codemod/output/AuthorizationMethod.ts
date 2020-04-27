import { SignedS3AWSRequest } from './SignedS3AWSRequest'

class AuthorizationMethod {
  fileUpload: any
  awsRequest: SignedS3AWSRequest
  request: any = {}
  con: any

  static makeSignParamsObject(signParams: any): any {
    throw new Error('Method not implemented.')
  }

  constructor(awsRequest: SignedS3AWSRequest) {
    this.awsRequest = awsRequest
    this.request = awsRequest.request
    this.fileUpload = awsRequest.fileUpload
    this.con = this.fileUpload.con
  }

  getBaseUrl(stringToSign) {
    const url = [
      this.con.signerUrl,
      '?to_sign=',
      stringToSign,
      '&datetime=',
      this.request.dateString
    ]

    if (this.con.sendCanonicalRequestToSignerUrl) {
      url.push('&canonical_request=')
      url.push(encodeURIComponent(this.awsRequest.canonicalRequest()))
    }

    return url.join('')
  }

  authorize() {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      this.awsRequest.currentXhr = xhr

      const stringToSign = this.awsRequest.stringToSign()

      let url = this.getBaseUrl(stringToSign)
      const signParams = AuthorizationMethod.makeSignParamsObject(
        this.fileUpload.signParams
      )

      for (const param in signParams) {
        if (!signParams.hasOwnProperty(param)) {
          continue
        }

        url += `&${encodeURIComponent(param)}=${encodeURIComponent(
          signParams[param]
        )}`
      }

      if (this.con.xhrWithCredentials) {
        xhr.withCredentials = true
      }

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            this.awsRequest
              .signResponse(xhr.response, stringToSign, this.request.dateString)
              .then(resolve)
          } else {
            if ([401, 403].includes(xhr.status)) {
              const reason = `status:${xhr.status}`
              this.fileUpload.deferredCompletion.reject(
                `Permission denied ${reason}`
              )
              return reject(reason)
            }

            reject(`Signature fetch returned status: ${xhr.status}`)
          }
        }
      }

      xhr.onerror = ev => {
        reject(`authorizedSend transport error: ${xhr.responseText}`)
      }

      xhr.open('GET', url)
      const signHeaders = AuthorizationMethod.makeSignParamsObject(
        this.con.signHeaders
      )

      for (const header in signHeaders) {
        if (!signHeaders.hasOwnProperty(header)) {
          continue
        }

        xhr.setRequestHeader(header, signHeaders[header])
      }

      if (typeof this.fileUpload.beforeSigner === 'function') {
        this.fileUpload.beforeSigner(xhr, url)
      }

      xhr.send()
    })
  }
}

AuthorizationMethod.makeSignParamsObject = params => {
  const out = {}

  for (const param in params) {
    if (!params.hasOwnProperty(param)) {
      continue
    }

    if (typeof params[param] === 'function') {
      out[param] = params[param]()
    } else {
      out[param] = params[param]
    }
  }

  return out
}
export { AuthorizationMethod }
