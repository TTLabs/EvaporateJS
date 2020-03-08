import { AuthorizationMethod } from "./AuthorizationMethod";

class AuthorizationCustom extends AuthorizationMethod {
  constructor(awsRequest) {
    super(awsRequest);
  }

  authorize() {
    return this.con
      .customAuthMethod(
        AuthorizationMethod.makeSignParamsObject(this.fileUpload.signParams),
        AuthorizationMethod.makeSignParamsObject(this.con.signHeaders),
        this.awsRequest.stringToSign(),
        this.request.dateString,
        this.awsRequest.canonicalRequest()
      )
      .catch(reason => {
        this.fileUpload.deferredCompletion.reject(reason);
        throw reason;
      });
  }
}
export { AuthorizationCustom };
