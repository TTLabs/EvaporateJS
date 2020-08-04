import { PutPart } from './PutPart'
import { EVAPORATE_STATUS } from './EvaporateStatusEnum'

interface S3PartDetail {
  awsRequest?: PutPart
  isEmpty: boolean
}

interface S3PartStats {
  loadedBytes: number
  loadedBytesPrevious?: number
  partNumber: number
  status: EVAPORATE_STATUS
  finishedUploadingAt?: string
}

export type InitialS3Part = S3PartDetail & S3PartStats

interface FileData {
  size: number
  md5_digest?: string
}

interface S3FileMetadata {
  eTag: string
  LastModified: string
}

export type S3File = FileData & S3FileMetadata & Pick<S3PartStats, 'partNumber'>

export type StartedS3Part = InitialS3Part & FileData
export type CompletedS3Part = StartedS3Part &
  S3FileMetadata &
  Pick<S3PartStats, 'finishedUploadingAt'>

export type S3Part = InitialS3Part | StartedS3Part | CompletedS3Part
