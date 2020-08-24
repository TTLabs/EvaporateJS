import { Dictionary } from '../Types'

export interface S3UploadStatsInterface {
  speed: number
  readableSpeed: string
  loaded: number
  totalUploaded: number
  remainingSize: number
  secondsLeft: number
  fileSize: number
}

export interface S3UploadInterface {
  eTag?: string
  completedAt?: string
  awsKey: string
  bucket: string
  createdAt: string
  fileSize: number
  fileType: string
  firstMd5Digest?: string
  lastModifiedDate: string
  partSize: number
  signParams: Dictionary<any>
  uploadId: string
}
