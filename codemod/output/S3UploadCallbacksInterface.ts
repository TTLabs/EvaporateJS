import { S3UploadStatsInterface } from './S3UploadInterface'

interface S3UploadLogCallbacksInterface {
  info: (...msg: string[]) => void
  warn: (...msg: string[]) => void
  error: (msg: string) => void
}

interface S3UploadLifecycleCallbacksInterface {
  started: (file_key: string) => void
  paused: (file_key?: string) => void
  resumed: (file_key?: string) => void
  pausing: (file_key?: string) => void
  progress: (p: number, stats: S3UploadStatsInterface) => void
  cancelled: () => void
  complete: (
    xhr: XMLHttpRequest,
    awsObjectKey: string,
    stats: S3UploadStatsInterface
  ) => void
}

interface S3UploadEventCallbacksInterface {
  beforeSigner?: (xhr: XMLHttpRequest, url: string) => void
  uploadInitiated: (s3UploadId?: string) => void
  nameChanged: (awsObjectKey: string) => void
}

export type S3UploadCallbacksInterface = S3UploadLogCallbacksInterface &
  S3UploadLifecycleCallbacksInterface &
  S3UploadEventCallbacksInterface
