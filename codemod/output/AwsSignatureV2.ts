import { AwsSignature } from './AwsSignature'
import { Global } from './Global'

class AwsSignatureV2 extends AwsSignature {
  authorizationString(): string {
    return ['AWS ', this.con.aws_key, ':', this.request.auth].join('')
  }

  stringToSign(): string {
    let x_amz_headers = ''
    let result: string
    const header_key_array: string[] = []

    for (const key in this.request.x_amz_headers) {
      if (this.request.x_amz_headers.hasOwnProperty(key)) {
        header_key_array.push(key)
      }
    }

    header_key_array.sort()

    header_key_array.forEach(header_key => {
      x_amz_headers += `${header_key}:${this.request.x_amz_headers[header_key]}\n`
    })

    const { method, md5_digest = '', path, contentType = '' } = this.request

    result = `${method}\n${md5_digest}\n${contentType}\n\n${x_amz_headers}${
      this.con.cloudfront ? `/${this.con.bucket}` : ''
    }${this.awsRequest.getPath()}${path}`
    Global.l.d('V2 stringToSign:', result)
    return result
  }

  dateString(timeOffset): string {
    return this.datetime(timeOffset).toUTCString()
  }

  getPayload(): Promise<void> {
    return Promise.resolve()
  }
}
export { AwsSignatureV2 }
