import { SignedS3AWSRequest } from './SignedS3AWSRequest'
import { Global } from './Global'
import {
  PARTS_MONITOR_INTERVAL_MS,
  COMPLETE,
  ABORTED,
  PAUSED,
  CANCELED,
  EVAPORATING,
  ERROR,
  PAUSING
} from './Constants'
import { getBlobSlice } from './Utils'

//http://docs.aws.amazon.com/AmazonS3/latest/API/mpUploadUploadPart.html
class PutPart extends SignedS3AWSRequest {
  public part: any = 1
  public partNumber: any
  public start: any = 0
  public end: any = 0
  public stalledInterval: any = -1
  public size: any = 0
  public result: any
  static size: number

  constructor(fileUpload, part) {
    super(fileUpload)

    this.part = part
    this.partNumber = part.partNumber
    this.start = (this.partNumber - 1) * fileUpload.con.partSize
    this.end = Math.min(
      this.partNumber * fileUpload.con.partSize,
      fileUpload.sizeBytes
    )

    const request = {
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

  getPartMd5Digest() {
    const self = this
    const part = this.part

    return new Promise((resolve, reject) => {
      if (self.con.computeContentMd5 && !part.md5_digest) {
        self.getPayload().then(data => {
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
    }).then(md5_digest => {
      if (md5_digest) {
        Global.l.d(self.request.step, 'MD5 digest:', md5_digest)
        self.request.md5_digest = md5_digest
        self.part.md5_digest = md5_digest
      }
    })
  }

  sendRequestToAWS() {
    this.stalledInterval = setInterval(
      this.stalledPartMonitor(),
      PARTS_MONITOR_INTERVAL_MS
    )
    this.stalledPartMonitor()
    return SignedS3AWSRequest.prototype.sendRequestToAWS.call(this)
  }

  send() {
    if (
      this.part.status !== COMPLETE &&
      ![ABORTED, PAUSED, CANCELED].includes(this.fileUpload.status)
    ) {
      Global.l.d(
        'uploadPart #',
        this.partNumber,
        this.attempts === 1 ? 'submitting' : 'retrying'
      )

      this.part.status = EVAPORATING
      this.attempts += 1
      this.part.loadedBytesPrevious = null
      const self = this

      return this.getPartMd5Digest().then(() => {
        Global.l.d('Sending', self.request.step)
        SignedS3AWSRequest.prototype.send.call(self)
      })
    }
  }

  success() {
    clearInterval(this.stalledInterval)
    const eTag = this.currentXhr.getResponseHeader('ETag')
    this.currentXhr = null

    if (this.fileUpload.partSuccess(eTag, this)) {
      this.awsDeferred.resolve(this.currentXhr)
    }
  }

  onProgress(evt) {
    if (evt.loaded > 0) {
      const loadedNow = evt.loaded - this.part.loadedBytes

      if (loadedNow) {
        this.part.loadedBytes = evt.loaded
        this.fileUpload.updateLoaded(loadedNow)
      }
    }
  }

  stalledPartMonitor() {
    const lastLoaded = this.part.loadedBytes
    const self = this

    return function() {
      clearInterval(self.stalledInterval)

      if (
        ![EVAPORATING, ERROR, PAUSING, PAUSED].includes(
          self.fileUpload.status
        ) &&
        self.part.status !== ABORTED &&
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

  resetLoadedBytes() {
    this.fileUpload.updateLoaded(-this.part.loadedBytes)
    this.part.loadedBytes = 0
    this.fileUpload.onProgress()
  }

  errorExceptionStatus() {
    return [CANCELED, ABORTED, PAUSED, PAUSING].includes(this.fileUpload.status)
  }

  delaySend() {
    const backOffWait = this.backOffWait()
    this.attempts += 1
    setTimeout(this.send.bind(this), backOffWait)
  }

  errorHandler(reason) {
    clearInterval(this.stalledInterval)

    if (reason.match(/status:404/)) {
      const errMsg = `404 error on part PUT. The part and the file will abort. ${reason}`
      Global.l.w(errMsg)
      this.fileUpload.error(errMsg)
      this.part.status = ABORTED
      this.awsDeferred.reject(errMsg)
      return true
    }

    this.resetLoadedBytes()
    this.part.status = ERROR

    if (!this.errorExceptionStatus()) {
      this.delaySend()
    }

    return true
  }

  abort() {
    if (this.currentXhr) {
      this.currentXhr.abort()
    }

    this.resetLoadedBytes()
    this.attempts = 1
  }

  streamToArrayBuffer(stream) {
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

  getPayload() {
    if (typeof this.payloadPromise === 'undefined') {
      this.payloadPromise = this.con.readableStreams
        ? this.payloadFromStream()
        : this.payloadFromBlob()
    }

    return this.payloadPromise
  }

  payloadFromStream() {
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

  payloadFromBlob() {
    // browsers' implementation of the Blob.slice function has been renamed a couple of times, and the meaning of the
    // 2nd parameter changed. For example Gecko went from slice(start,length) -> mozSlice(start, end) -> slice(start, end).
    // As of 12/12/12, it seems that the unified 'slice' is the best bet, hence it being first in the list. See
    // https://developer.mozilla.org/en-US/docs/DOM/Blob for more info.
    const file = this.fileUpload.file

    const slicerFn = getBlobSlice()
    const blob = slicerFn(this.start, this.end)

    if (this.con.computeContentMd5) {
      return new Promise(resolve => {
        const reader = new FileReader()

        reader.onloadend = function() {
          resolve(this.result)
        }

        reader.readAsArrayBuffer(blob)
      })
    }

    return Promise.resolve(blob)
  }

  getStartedPromise() {
    return this.started.promise
  }
}

export { PutPart }
