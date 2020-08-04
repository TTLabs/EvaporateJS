import { AwsSignature } from './AwsSignature'
import { uri, awsUrl } from './Utils'
import { Global } from './Global'
import { PutPart } from './PutPart'

class AwsSignatureV4 extends AwsSignature {
  public _cr: string
  public payload: ArrayBuffer

  error(): void {
    this._cr = undefined
  }

  getPayload(): Promise<void> {
    const awsRequest = this.awsRequest as PutPart

    return awsRequest.getPayload().then((data: ArrayBuffer) => {
      this.payload = data
    })
  }

  authorizationString(): string {
    const authParts: string[] = []
    const credentials = this.credentialString()
    const headers = this.canonicalHeaders()
    authParts.push(
      ['AWS4-HMAC-SHA256 Credential=', this.con.aws_key, '/', credentials].join(
        ''
      )
    )
    authParts.push(`SignedHeaders=${headers.signedHeaders}`)
    authParts.push(`Signature=${this.request.auth}`)
    return authParts.join(', ')
  }

  stringToSign(): string {
    const signParts: string[] = []
    signParts.push('AWS4-HMAC-SHA256')
    signParts.push(this.request.dateString)
    signParts.push(this.credentialString())
    signParts.push(this.con.cryptoHexEncodedHash256(this.canonicalRequest()))
    const result = signParts.join('\n')
    Global.l.d('V4 stringToSign:', result)
    return result
  }

  credentialString(): string {
    const credParts: string[] = []
    credParts.push(this.request.dateString.slice(0, 8))
    credParts.push(this.con.awsRegion)
    credParts.push('s3')
    credParts.push('aws4_request')
    return credParts.join('/')
  }

  canonicalQueryString(): string {
    const qs = this.awsRequest.request.query_string || ''
    const search = uri([this.awsRequest.awsUrl, this.request.path, qs].join(''))
      .search
    const searchParts = search.length ? search.split('&') : []

    type EncodedQueryString = { name: string; value: string }
    const encoded: EncodedQueryString[] = []
    let nameValue: string | string[]
    let i: number

    for (i = 0; i < searchParts.length; i++) {
      nameValue = searchParts[i].split('=')

      encoded.push({
        name: encodeURIComponent(nameValue[0]),
        value: nameValue.length > 1 ? encodeURIComponent(nameValue[1]) : null
      })
    }

    const sorted = encoded.sort(
      (a: EncodedQueryString, b: EncodedQueryString) => {
        if (a.name < b.name) {
          return -1
        } else if (a.name > b.name) {
          return 1
        }

        return 0
      }
    )

    const result: string[] = []

    for (i = 0; i < sorted.length; i++) {
      nameValue = sorted[i].value
        ? [sorted[i].name, sorted[i].value].join('=')
        : `${sorted[i].name}=`
      result.push(nameValue)
    }

    return result.join('&')
  }

  getPayloadSha256Content(): string {
    const result =
      this.request.contentSha256 ||
      this.con.cryptoHexEncodedHash256(this.payload || '')
    Global.l.d(this.request.step, 'getPayloadSha256Content:', result)
    return result
  }

  canonicalHeaders(): {
    canonicalHeaders: string
    signedHeaders: string
  } {
    const canonicalHeaders: string[] = []
    const keys: string[] = []
    let i: number

    function addHeader(name: string, value: string) {
      const key = name.toLowerCase()
      keys.push(key)
      canonicalHeaders[key] = value.replace(/\s+/g, ' ')
    }

    if (this.request.md5_digest) {
      addHeader('Content-Md5', this.request.md5_digest)
    }

    addHeader('Host', this.awsRequest.awsHost)

    if (this.request.contentType) {
      addHeader('Content-Type', this.request.contentType || '')
    }

    const amzHeaders = this.request.x_amz_headers || {}

    for (const key in amzHeaders) {
      if (amzHeaders.hasOwnProperty(key)) {
        addHeader(key, amzHeaders[key])
      }
    }

    const sortedKeys = keys.sort((a: string, b: string) => {
      if (a < b) {
        return -1
      } else if (a > b) {
        return 1
      }

      return 0
    })

    const result: string[] = []
    const unsigned_headers: string[] = []
    const not_signed = Object.keys(this.request.not_signed_headers) || []
    const signed_headers: string[] = []

    for (i = 0; i < not_signed.length; i++) {
      unsigned_headers.push(not_signed[i].toLowerCase())
    }

    for (i = 0; i < sortedKeys.length; i++) {
      const k = sortedKeys[i]
      result.push([k, canonicalHeaders[k]].join(':'))

      if (!unsigned_headers.includes(k)) {
        signed_headers.push(k)
      }
    }

    return {
      canonicalHeaders: result.join('\n'),
      signedHeaders: signed_headers.join(';')
    }
  }

  canonicalRequest(): string {
    if (typeof this._cr !== 'undefined') {
      return this._cr
    }

    const canonParts: string[] = []
    canonParts.push(this.request.method)

    canonParts.push(
      uri(
        [
          this.awsRequest.awsUrl,
          this.awsRequest.getPath(),
          this.request.path
        ].join('')
      ).pathname
    )

    canonParts.push(this.canonicalQueryString() || '')
    const headers = this.canonicalHeaders()
    canonParts.push(`${headers.canonicalHeaders}\n`)
    canonParts.push(headers.signedHeaders)
    canonParts.push(this.getPayloadSha256Content())
    this._cr = canonParts.join('\n')
    Global.l.d(this.request.step, 'V4 CanonicalRequest:', this._cr)
    return this._cr
  }

  setHeaders(xhr: XMLHttpRequest): void {
    xhr.setRequestHeader('x-amz-content-sha256', this.getPayloadSha256Content())
  }
}

export { AwsSignatureV4 }
