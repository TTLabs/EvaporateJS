import { S3UploadCallbacksInterface } from '../FileUpload/S3UploadCallbacksInterface'
import { Dictionary } from '../Types'

interface UploadHeadersInterface {
  xAmzHeadersAtInitiate: Dictionary<string>
  notSignedHeadersAtInitiate: Dictionary<string>
  xAmzHeadersAtUpload: Dictionary<string>
  xAmzHeadersAtComplete: Dictionary<string>
  xAmzHeadersCommon: Dictionary<string>
  contentType: string
}

interface UploadFileDataInterface {
  name: string
  file: File
}

export type UploadFileConfig = S3UploadCallbacksInterface &
  UploadHeadersInterface &
  UploadFileDataInterface
