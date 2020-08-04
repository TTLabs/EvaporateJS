import Evaporate from './Evaporate'
import { IMMUTABLE_OPTIONS } from './Constants'
import { Dictionary } from './Types'

export interface EvaporateConfigInterface {
  readableStreams?: boolean
  readableStreamPartMethod?:
    | null
    | ((file: File, start: number, end: number) => ReadableStream)
  bucket: string
  logging?: boolean
  maxConcurrentParts?: number
  partSize?: number
  retryBackoffPower?: number
  maxRetryBackoffSecs?: number
  progressIntervalMS?: number
  cloudfront?: boolean
  s3Acceleration?: boolean
  mockLocalStorage?: boolean
  encodeFilename?: boolean
  computeContentMd5?: boolean
  allowS3ExistenceOptimization?: boolean
  onlyRetryForSameFileName?: boolean
  timeUrl?: string
  cryptoMd5Method?: null | ((data: ArrayBuffer) => string)
  cryptoHexEncodedHash256?:
    | null
    | ((data: string | ArrayBuffer | null) => string)
  aws_url?: string
  aws_key?: string
  awsRegion?: string
  awsSignatureVersion?: '2' | '4'
  signerUrl?: string
  sendCanonicalRequestToSignerUrl?: boolean
  s3FileCacheHoursAgo?: null | number
  signParams?: Dictionary<any>
  signHeaders?: Dictionary<any>
  customAuthMethod?:
    | null
    | ((
        signParams: Dictionary<any>,
        signHeaders: Dictionary<any>,
        stringToSign: string,
        signatureDateTime: string,
        canonicalRequest: string
      ) => Promise<string>)
  maxFileSize?: number
  signResponseHandler?:
    | null
    | ((
        response: any,
        stringToSign: string,
        signatureDateTime: string
      ) => Promise<string>)
  xhrWithCredentials?: boolean
  localTimeOffset?: number
  evaporateChanged?: (evaporate: Evaporate, evaporatingCount: number) => void
  abortCompletionThrottlingMs?: number
}

type OverridableConfigKeys = Exclude<
  keyof EvaporateConfigInterface,
  typeof IMMUTABLE_OPTIONS
>

export interface EvaporateOverrideConfigInterface
  extends Pick<EvaporateConfigInterface, OverridableConfigKeys> {}
