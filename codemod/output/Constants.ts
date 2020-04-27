const FAR_FUTURE = new Date('2060-10-22')
const PENDING = 0
const EVAPORATING = 2
const COMPLETE = 3
const PAUSED = 4
const CANCELED = 5
const ERROR = 10
const ABORTED = 20
const PAUSING = 30
const PAUSED_STATUSES = [PAUSED, PAUSING]
const ACTIVE_STATUSES = [PENDING, EVAPORATING, ERROR]
const ETAG_OF_0_LENGTH_BLOB = '"d41d8cd98f00b204e9800998ecf8427e"'
const PARTS_MONITOR_INTERVAL_MS = 2 * 60 * 1000
const IMMUTABLE_OPTIONS = [
  'maxConcurrentParts',
  'logging',
  'cloudfront',
  'encodeFilename',
  'computeContentMd5',
  'allowS3ExistenceOptimization',
  'onlyRetryForSameFileName',
  'timeUrl',
  'cryptoMd5Method',
  'cryptoHexEncodedHash256',
  'awsRegion',
  'awsSignatureVersion',
  'evaporateChanged'
]
const S3_EXTRA_ENCODED_CHARS = {
  // !
  33: '%21',

  // '
  39: '%27',

  // (
  40: '%28',

  // )
  41: '%29',

  // *
  42: '%2A'
}
export {
  FAR_FUTURE,
  PENDING,
  EVAPORATING,
  COMPLETE,
  PAUSED,
  CANCELED,
  ERROR,
  ABORTED,
  PAUSING,
  PAUSED_STATUSES,
  ACTIVE_STATUSES,
  ETAG_OF_0_LENGTH_BLOB,
  PARTS_MONITOR_INTERVAL_MS,
  IMMUTABLE_OPTIONS,
  S3_EXTRA_ENCODED_CHARS
}
