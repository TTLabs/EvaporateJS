import { HistoryCache } from '../Utils/HistoryCache'
import { FileUpload } from '../FileUpload/FileUpload'
import { Global } from '../Global'

import { IMMUTABLE_OPTIONS } from '../Constants'
import {
  EVAPORATE_STATUS,
  ACTIVE_STATUSES,
  PAUSED_STATUSES
} from './EvaporateStatusEnum'

import {
  extend,
  noOpLogger,
  removeAtIndex,
  readableFileSize,
  s3EncodedObjectName,
  getSupportedBlobSlice
} from '../Utils'

import {
  EvaporateConfigInterface,
  EvaporateOverrideConfigInterface
} from './EvaporateConfigInterface'

import { UploadFileConfig } from './EvaporateUploadFileInterface'
import { EvaporateValidationEnum } from './EvaporateValidationEnum'
import { Dictionary } from '../Types'

class Evaporate {
  public config: EvaporateConfigInterface = null
  public _instantiationError: EvaporateValidationEnum
  public supported: boolean = false
  public localTimeOffset: number = 0
  public pendingFiles: Dictionary<FileUpload> = {}
  public queuedFiles: Array<FileUpload> = []
  public filesInProcess: Array<FileUpload> = []
  public evaporatingCount: number = 0

  static getLocalTimeOffset(config: EvaporateConfigInterface): Promise<number> {
    return new Promise(
      (resolve: (value: number) => void, reject: (value: string) => void) => {
        if (typeof config.localTimeOffset === 'number') {
          return resolve(config.localTimeOffset)
        }

        if (config.timeUrl) {
          const xhr = new XMLHttpRequest()
          xhr.open(
            'GET',
            `${config.timeUrl}?requestTime=${new Date().getTime()}`
          )

          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4 && xhr.status === 200) {
              const server_date = new Date(
                Date.parse(xhr.responseText)
              ).getTime()
              const offset = server_date - new Date().getTime()
              Global.l.d('localTimeOffset is', offset, 'ms')
              resolve(offset)
            }
          }

          xhr.onerror = ev => {
            Global.l.e('xhr error timeUrl', xhr)
            reject(`Fetching offset time failed with status: ${xhr.status}`)
          }

          xhr.send()
        } else {
          resolve(0)
        }
      }
    )
  }

  static create(config: EvaporateConfigInterface): Promise<Evaporate> {
    const evapConfig = extend({}, config) as EvaporateConfigInterface

    return Evaporate.getLocalTimeOffset(evapConfig).then((offset: number) => {
      evapConfig.localTimeOffset = offset

      return new Promise(
        (
          resolve: (evaporate: Evaporate) => void,
          reject: (validationStatus: EvaporateValidationEnum) => void
        ) => {
          const e = new Evaporate(evapConfig)

          if (e.supported === true) {
            resolve(e)
          } else {
            reject(e._instantiationError)
          }
        }
      )
    })
  }

  constructor(config: EvaporateConfigInterface) {
    this.config = extend(
      {
        readableStreams: false,
        readableStreamPartMethod: null,
        bucket: null,
        logging: true,
        maxConcurrentParts: 5,
        partSize: 6 * 1024 * 1024,
        retryBackoffPower: 2,
        maxRetryBackoffSecs: 300,
        progressIntervalMS: 1000,
        cloudfront: false,
        s3Acceleration: false,
        mockLocalStorage: false,
        encodeFilename: true,
        computeContentMd5: false,
        allowS3ExistenceOptimization: false,
        onlyRetryForSameFileName: false,
        timeUrl: null,
        cryptoMd5Method: null,
        cryptoHexEncodedHash256: null,
        aws_key: null,
        awsRegion: 'us-east-1',
        awsSignatureVersion: '4',
        sendCanonicalRequestToSignerUrl: false,

        // Must be a whole number of hours. Will be interpreted as negative (hours in the past).
        s3FileCacheHoursAgo: null,

        signParams: {},
        signHeaders: {},
        customAuthMethod: undefined,
        maxFileSize: null,
        signResponseHandler: null,
        xhrWithCredentials: false,

        // undocumented, experimental
        localTimeOffset: undefined,

        evaporateChanged() {},
        abortCompletionThrottlingMs: 1000
      },
      config
    ) as EvaporateConfigInterface

    if (typeof window !== 'undefined' && window.console) {
      Global.l = {
        ...window.console,
        d: Global.l.log,
        w: window.console.warn ? Global.l.warn : Global.l.d,
        e: window.console.error ? Global.l.error : Global.l.d
      }
    }

    this._instantiationError = this.validateEvaporateOptions()

    if (this._instantiationError !== EvaporateValidationEnum.OK) {
      this.supported = false
      return
    } else {
      delete this._instantiationError
    }

    if (!this.config.logging) {
      // Reset the logger to be a no_op
      Global.l = noOpLogger()
    }

    const _d = new Date()
    Global.HOURS_AGO = new Date(
      _d.setHours(_d.getHours() - (this.config.s3FileCacheHoursAgo || -100))
    )

    if (typeof config.localTimeOffset === 'number') {
      this.localTimeOffset = config.localTimeOffset
    } else {
      const self = this

      Evaporate.getLocalTimeOffset(this.config).then(offset => {
        self.localTimeOffset = offset
      })
    }

    this.pendingFiles = {}
    this.queuedFiles = []
    this.filesInProcess = []
    Global.historyCache = new HistoryCache(this.config.mockLocalStorage)
  }

  startNextFile(reason: string) {
    if (
      !this.queuedFiles.length ||
      this.evaporatingCount >= this.config.maxConcurrentParts
    ) {
      return
    }

    const fileUpload: FileUpload = this.queuedFiles.shift()

    if (fileUpload.status === EVAPORATE_STATUS.PENDING) {
      Global.l.d(
        'Starting',
        decodeURIComponent(fileUpload.name),
        'reason:',
        reason
      )
      this.evaporatingCnt(+1)
      fileUpload.start()
    } else {
      // Add the file back to the stack, it's not ready
      Global.l.d(
        'Requeued',
        decodeURIComponent(fileUpload.name),
        'status:',
        fileUpload.status,
        'reason:',
        reason
      )

      this.queuedFiles.push(fileUpload)
    }
  }

  fileCleanup(fileUpload: FileUpload) {
    removeAtIndex(this.queuedFiles, fileUpload)

    if (removeAtIndex(this.filesInProcess, fileUpload)) {
      this.evaporatingCnt(-1)
    }

    fileUpload.done()
    this.consumeRemainingSlots()
  }

  queueFile(fileUpload: FileUpload) {
    this.filesInProcess.push(fileUpload)
    this.queuedFiles.push(fileUpload)

    if (this.filesInProcess.length === 1) {
      this.startNextFile('first file')
    }
  }

  add(
    uploadFileConfig: UploadFileConfig,
    overrideEvaporateConfig?: EvaporateOverrideConfigInterface
  ): Promise<string> {
    const self = this
    let evaporateConfig

    return new Promise(
      (resolve: (value: string) => void, reject: (error: string) => void) => {
        const c = extend(overrideEvaporateConfig, {})

        IMMUTABLE_OPTIONS.forEach((a: string) => {
          delete c[a]
        })

        evaporateConfig = extend(self.config, c)

        if (
          typeof uploadFileConfig === 'undefined' ||
          typeof uploadFileConfig.file === 'undefined'
        ) {
          return reject('Missing file')
        }

        if (
          evaporateConfig.maxFileSize &&
          uploadFileConfig.file.size > evaporateConfig.maxFileSize
        ) {
          return reject(
            `File size too large. Maximum size allowed is ${readableFileSize(
              evaporateConfig.maxFileSize
            )}`
          )
        }

        if (typeof uploadFileConfig.name === 'undefined') {
          return reject('Missing attribute: name')
        }

        if (evaporateConfig.encodeFilename) {
          // correctly encode to an S3 object name, considering '/' and ' '
          uploadFileConfig.name = s3EncodedObjectName(uploadFileConfig.name)
        }

        const fileConfig = extend({}, uploadFileConfig, {
          status: EVAPORATE_STATUS.PENDING,
          priority: 0,
          loadedBytes: 0,
          sizeBytes: uploadFileConfig.file.size,
          eTag: ''
        }) as UploadFileConfig

        const fileUpload = new FileUpload(fileConfig, evaporateConfig, self)

        const fileKey = fileUpload.id
        self.pendingFiles[fileKey] = fileUpload
        self.queueFile(fileUpload)

        // Resolve or reject the Add promise based on how the fileUpload completes
        fileUpload.deferredCompletion.promise.then(
          () => {
            self.fileCleanup(fileUpload)
            resolve(decodeURIComponent(fileUpload.name))
          },
          (reason: string) => {
            self.fileCleanup(fileUpload)
            reject(reason)
          }
        )
      }
    )
  }

  cancel(id: string) {
    return typeof id === 'undefined' ? this._cancelAll() : this._cancelOne(id)
  }

  _cancelAll() {
    Global.l.d('Canceling all file uploads')
    const promises = []

    for (const key in this.pendingFiles) {
      if (this.pendingFiles.hasOwnProperty(key)) {
        const file = this.pendingFiles[key]

        if (ACTIVE_STATUSES.includes(file.status)) {
          promises.push(file.stop())
        }
      }
    }

    if (!promises.length) {
      promises.push(Promise.reject('No files to cancel.'))
    }

    return Promise.all(promises)
  }

  _cancelOne(id: string) {
    const promise = []

    if (this.pendingFiles[id]) {
      promise.push(this.pendingFiles[id].stop())
    } else {
      promise.push(Promise.reject('File does not exist'))
    }

    return Promise.all(promise)
  }

  pause(id: string, options: { force?: boolean } = {}): Promise<any> {
    const force: boolean =
      typeof options.force === 'undefined' ? false : options.force

    return typeof id === 'undefined'
      ? this._pauseAll(force)
      : this._pauseOne(id, force)
  }

  _pauseAll(force: boolean): Promise<any> {
    Global.l.d('Pausing all file uploads')
    const promises = []

    for (const key in this.pendingFiles) {
      if (this.pendingFiles.hasOwnProperty(key)) {
        const file = this.pendingFiles[key]

        if (ACTIVE_STATUSES.includes(file.status)) {
          this._pause(file, force, promises)
        }
      }
    }

    return Promise.all(promises)
  }

  _pauseOne(id: string, force: boolean) {
    const promises = []
    const file = this.pendingFiles[id]

    if (typeof file === 'undefined') {
      promises.push(
        Promise.reject('Cannot pause a file that has not been added.')
      )
    } else if (file.status === EVAPORATE_STATUS.PAUSED) {
      promises.push(
        Promise.reject('Cannot pause a file that is already paused.')
      )
    }

    if (!promises.length) {
      this._pause(file, force, promises)
    }

    return Promise.all(promises)
  }

  _pause(fileUpload: FileUpload, force: boolean, promises): void {
    promises.push(fileUpload.pause(force))
    removeAtIndex(this.filesInProcess, fileUpload)
    removeAtIndex(this.queuedFiles, fileUpload)
  }

  resume(id: string): Promise<string[] | void> {
    return typeof id === 'undefined' ? this._resumeAll() : this._resumeOne(id)
  }

  _resumeAll() {
    Global.l.d('Resuming all file uploads')

    for (const key in this.pendingFiles) {
      if (this.pendingFiles.hasOwnProperty(key)) {
        const file = this.pendingFiles[key]

        if (PAUSED_STATUSES.includes(file.status)) {
          this.resumeFile(file)
        }
      }
    }

    return Promise.resolve()
  }

  _resumeOne(id: string): Promise<string[]> {
    const file = this.pendingFiles[id]
    const promises = []

    if (typeof file === 'undefined') {
      promises.push(Promise.reject('Cannot pause a file that does not exist.'))
    } else if (!PAUSED_STATUSES.includes(file.status)) {
      promises.push(
        Promise.reject('Cannot resume a file that has not been paused.')
      )
    } else {
      this.resumeFile(file)
    }

    return Promise.all(promises)
  }

  resumeFile(fileUpload: FileUpload): void {
    fileUpload.resume()
    this.queueFile(fileUpload)
  }

  forceRetry() {}

  consumeRemainingSlots(): void {
    let avail = this.config.maxConcurrentParts - this.evaporatingCount

    if (!avail) {
      return
    }

    for (let i = 0; i < this.filesInProcess.length; i++) {
      const file = this.filesInProcess[i]
      const consumed = file.consumeSlots()

      if (consumed < 0) {
        continue
      }

      avail -= consumed

      if (!avail) {
        return
      }
    }
  }

  validateEvaporateOptions(): EvaporateValidationEnum {
    this.supported = !(
      typeof File === 'undefined' || typeof Promise === 'undefined'
    )

    if (!this.supported) {
      return EvaporateValidationEnum.MISSING_SUPPORT_FILE_PROMISE
    }

    if (this.config.readableStreams) {
      if (typeof this.config.readableStreamPartMethod !== 'function') {
        return EvaporateValidationEnum.MISSING_READABLE_STREAM_PART_METHOD
      }
    } else {
      if (!getSupportedBlobSlice()) {
        return EvaporateValidationEnum.MISSING_SUPPORT_BLOB
      }
    }

    if (
      !this.config.signerUrl &&
      typeof this.config.customAuthMethod !== 'function'
    ) {
      return EvaporateValidationEnum.MISSING_SIGNER_URL
    }

    if (!this.config.bucket) {
      return EvaporateValidationEnum.MISSING_BUCKET
    }

    if (this.config.computeContentMd5) {
      this.supported =
        typeof FileReader.prototype.readAsArrayBuffer !== 'undefined'

      if (!this.supported) {
        return EvaporateValidationEnum.MISSING_SUPPORT_READ_AS_ARRAY_BUFFER
      }

      if (typeof this.config.cryptoMd5Method !== 'function') {
        return EvaporateValidationEnum.MISSING_COMPUTE_CONTENT_MD5
      }

      if (this.config.awsSignatureVersion === '4') {
        if (typeof this.config.cryptoHexEncodedHash256 !== 'function') {
          return EvaporateValidationEnum.MISSING_V4_CRYPTO_HEX_ENCODED_HASH256
        }
      }
    } else if (this.config.awsSignatureVersion === '4') {
      return EvaporateValidationEnum.MISSING_V4_COMPUTE_CONTENT_MD5
    }

    return EvaporateValidationEnum.OK
  }

  evaporatingCnt(incr: number): void {
    this.evaporatingCount = Math.max(0, this.evaporatingCount + incr)
    this.config.evaporateChanged(this, this.evaporatingCount)
  }
}

export default Evaporate
