import { AwsSignature } from "./AwsSignature";
import { Global } from "./Global";

class AwsSignatureV2 extends AwsSignature {
  constructor(request) {
    super(request);
  }

  authorizationString() {
    return ["AWS ", this.con.aws_key, ":", this.request.auth].join("");
  }

  stringToSign() {
    let x_amz_headers = "";
    let result;
    const header_key_array = [];

    for (const key in this.request.x_amz_headers) {
      if (this.request.x_amz_headers.hasOwnProperty(key)) {
        header_key_array.push(key);
      }
    }

    header_key_array.sort();

    header_key_array.forEach(header_key => {
      x_amz_headers += `${header_key}:${this.request.x_amz_headers[header_key]}\n`;
    });

    result = `${this.request.method}\n${this.request.md5_digest || ""}\n${this
      .request.contentType || ""}\n\n${x_amz_headers}${
      this.con.cloudfront ? `/${this.con.bucket}` : ""
    }${this.awsRequest.getPath()}${this.request.path}`;
    Global.l.d("V2 stringToSign:", result);
    return result;
  }

  dateString(timeOffset) {
    return this.datetime(timeOffset).toUTCString();
  }

  getPayload() {
    return Promise.resolve();
  }
}
export { AwsSignatureV2 };
