import { SignedS3AWSRequest } from './SignedS3AWSRequest'
import { Global } from '../Global'
import { PARTS_MONITOR_INTERVAL_MS } from '../Constants'
import { EVAPORATE_STATUS } from '../Evaporate/EvaporateStatusEnum'
import { getSupportedBlobSlice } from '../Utils'
import { Request } from '../Types'
import { FileUpload } from '../FileUpload/FileUpload'
import {
  S3Part,
  StartedS3Part,
  CompletedS3Part
} from '../FileUpload/S3PartInterface'

type PartialSignedS3AWSRequest = new (fileUpload: FileUpload) => {
  [P in Exclude<
    keyof SignedS3AWSRequest,
    | 'send'
    | 'sendRequestToAWS'
    | 'getPayload'
    | 'success'
    | 'errorExceptionStatus'
    | 'errorHandler'
  >]: SignedS3AWSRequest[P]
}

const PartialSignedS3AWSRequest: PartialSignedS3AWSRequest = SignedS3AWSRequest

//http://docs.aws.amazon.com/AmazonS3/latest/API/mpUploadUploadPart.html
class PutPart extends PartialSignedS3AWSRequest {
  public part: S3Part
  public partNumber: number
  public start: number = 0
  public end: number = 0
  public stalledInterval: ReturnType<typeof setInterval> = null
  public result: any
  static size: number

  constructor(fileUpload: FileUpload, part: S3Part) {
    super(fileUpload)

    this.part = part
    this.partNumber = part.partNumber
    this.start = (this.partNumber - 1) * fileUpload.con.partSize
    this.end = Math.min(
      this.partNumber * fileUpload.con.partSize,
      fileUpload.sizeBytes
    )

    const request: Request = {
      method: 'PUT',
      path: `?partNumber=${this.partNumber}&uploadId=${fileUpload.uploadId}`,
      step: `upload #${this.partNumber}`,
      x_amz_headers:
        fileUpload.xAmzHeadersCommon || fileUpload.xAmzHeadersAtUpload,
      contentSha256: 'UNSIGNED-PAYLOAD',
      onProgress: this.onProgress.bind(this)
    }

    this.updateRequest(request)
  }

  getPartMd5Digest(): Promise<void> {
    const self = this
    const part = this.part as StartedS3Part | CompletedS3Part

    return new Promise((resolve, reject) => {
      if (self.con.computeContentMd5 && !part.md5_digest) {
        self.getPayload().then((data: ArrayBuffer) => {
          const md5_digest = self.con.cryptoMd5Method(data)

          if (
            self.partNumber === 1 &&
            self.con.computeContentMd5 &&
            typeof self.fileUpload.firstMd5Digest === 'undefined'
          ) {
            self.fileUpload.firstMd5Digest = md5_digest

            self.fileUpload.updateUploadFile({
              firstMd5Digest: md5_digest
            })
          }

          resolve(md5_digest)
        }, reject)
      } else {
        resolve(part.md5_digest)
      }
    }).then((md5_digest: string) => {
      if (md5_digest) {
        Global.l.d(self.request.step, 'MD5 digest:', md5_digest)
        self.request.md5_digest = md5_digest

        part.md5_digest = md5_digest
        self.part = part
      }
    })
  }

  sendRequestToAWS(): Promise<string> {
    this.stalledInterval = setInterval(
      this.stalledPartMonitor(),
      PARTS_MONITOR_INTERVAL_MS
    )
    this.stalledPartMonitor()
    return SignedS3AWSRequest.prototype.sendRequestToAWS.call(this)
  }

  send(): Promise<void> {
    if (
      this.part.status !== EVAPORATE_STATUS.COMPLETE &&
      ![
        EVAPORATE_STATUS.ABORTED,
        EVAPORATE_STATUS.PAUSED,
        EVAPORATE_STATUS.CANCELED
      ].includes(this.fileUpload.status)
    ) {
      Global.l.d(
        'uploadPart #',
        this.partNumber,
        this.attempts === 1 ? 'submitting' : 'retrying'
      )

      this.part.status = EVAPORATE_STATUS.EVAPORATING
      this.attempts += 1
      this.part.loadedBytesPrevious = null
      const self = this

      return this.getPartMd5Digest().then(() => {
        Global.l.d('Sending', self.request.step)
        SignedS3AWSRequest.prototype.send.call(self)
      })
    }
  }

  success(): void {
    clearInterval(this.stalledInterval)
    const eTag = this.currentXhr.getResponseHeader('ETag')
    this.currentXhr = null

    if (this.fileUpload.partSuccess(eTag, this)) {
      this.awsDeferred.resolve(this.currentXhr)
    }
  }

  onProgress(evt: ProgressEvent): void {
    if (evt.loaded > 0) {
      const loadedNow = evt.loaded - this.part.loadedBytes

      if (loadedNow) {
        this.part.loadedBytes = evt.loaded
        this.fileUpload.updateLoaded(loadedNow)
      }
    }
  }

  stalledPartMonitor(): () => void {
    const lastLoaded = this.part.loadedBytes
    const self = this

    return function () {
      clearInterval(self.stalledInterval)

      if (
        ![
          EVAPORATE_STATUS.EVAPORATING,
          EVAPORATE_STATUS.ERROR,
          EVAPORATE_STATUS.PAUSING,
          EVAPORATE_STATUS.PAUSED
        ].includes(self.fileUpload.status) &&
        self.part.status !== EVAPORATE_STATUS.ABORTED &&
        self.part.loadedBytes < this.size
      ) {
        if (lastLoaded === self.part.loadedBytes) {
          Global.l.w(
            'Part stalled. Will abort and retry:',
            self.partNumber,
            decodeURIComponent(self.fileUpload.name)
          )

          self.abort()

          if (!self.errorExceptionStatus()) {
            self.delaySend()
          }
        } else {
          self.stalledInterval = setInterval(
            self.stalledPartMonitor(),
            PARTS_MONITOR_INTERVAL_MS
          )
        }
      }
    }
  }

  resetLoadedBytes(): void {
    this.fileUpload.updateLoaded(-this.part.loadedBytes)
    this.part.loadedBytes = 0
    this.fileUpload.onProgress()
  }

  errorExceptionStatus(): boolean {
    return [
      EVAPORATE_STATUS.CANCELED,
      EVAPORATE_STATUS.ABORTED,
      EVAPORATE_STATUS.PAUSED,
      EVAPORATE_STATUS.PAUSING
    ].includes(this.fileUpload.status)
  }

  delaySend(): void {
    const backOffWait = this.backOffWait()
    this.attempts += 1
    setTimeout(this.send.bind(this), backOffWait)
  }

  errorHandler(reason: string): boolean {
    clearInterval(this.stalledInterval)

    if (reason.match(/status:404/)) {
      const errMsg = `404 error on part PUT. The part and the file will abort. ${reason}`
      Global.l.w(errMsg)
      this.fileUpload.error(errMsg)
      this.part.status = EVAPORATE_STATUS.ABORTED
      this.awsDeferred.reject(errMsg)
      return true
    }

    this.resetLoadedBytes()
    this.part.status = EVAPORATE_STATUS.ERROR

    if (!this.errorExceptionStatus()) {
      this.delaySend()
    }

    return true
  }

  abort(): void {
    if (this.currentXhr) {
      this.currentXhr.abort()
    }

    this.resetLoadedBytes()
    this.attempts = 1
  }

  streamToArrayBuffer(stream): Promise<Uint8Array | []> {
    return new Promise((resolve, reject) => {
      // stream is empty or ended
      if (!stream.readable) {
        return resolve([])
      }

      let arr = new Uint8Array(
        Math.min(this.con.partSize, this.end - this.start)
      )
      let i = 0
      stream.on('data', onData)
      stream.on('end', onEnd)
      stream.on('error', onEnd)
      stream.on('close', onClose)

      function onData(data) {
        if (data.byteLength === 1) {
          return
        }

        arr.set(data, i)
        i += data.byteLength
      }

      function onEnd(err) {
        if (err) {
          reject(err)
        } else {
          resolve(arr)
        }

        cleanup()
      }

      function onClose() {
        resolve(arr)
        cleanup()
      }

      function cleanup() {
        arr = null
        stream.removeListener('data', onData)
        stream.removeListener('end', onEnd)
        stream.removeListener('error', onEnd)
        stream.removeListener('close', onClose)
      }
    })
  }

  getPayload(): Promise<Uint8Array | ArrayBuffer | string | []> {
    if (typeof this.payloadPromise === 'undefined') {
      this.payloadPromise = this.con.readableStreams
        ? this.payloadFromStream()
        : this.payloadFromBlob()
    }

    return this.payloadPromise
  }

  payloadFromStream(): Promise<Uint8Array | []> {
    const stream = this.con.readableStreamPartMethod(
      this.fileUpload.file,
      this.start,
      this.end - 1
    )

    return new Promise((resolve, reject) => {
      const streamPromise = this.streamToArrayBuffer(stream)

      streamPromise.then(data => {
        resolve(data)
      }, reject)
    })
  }

  payloadFromBlob(): Promise<string | ArrayBuffer> {
    // browsers' implementation of the Blob.slice function has been renamed a couple of times, and the meaning of the
    // 2nd parameter changed. For example Gecko went from slice(start,length) -> mozSlice(start, end) -> slice(start, end).
    // As of 12/12/12, it seems that the unified 'slice' is the best bet, hence it being first in the list. See
    // https://developer.mozilla.org/en-US/docs/DOM/Blob for more info.
    const { file } = this.fileUpload

    const slicerKey = getSupportedBlobSlice()
    const blob = file[slicerKey](this.start, this.end)

    if (this.con.computeContentMd5) {
      return new Promise(resolve => {
        const reader = new FileReader()

        reader.onloadend = function () {
          resolve(this.result)
        }

        reader.readAsArrayBuffer(blob)
      })
    }

    return Promise.resolve(blob)
  }

  getStartedPromise(): Promise<string> {
    return this.started.promise
  }
}

export { PutPart }
