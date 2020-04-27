import { PutPart } from './PutPart'
import { CompleteMultipartUpload } from './CompleteMultipartUpload'
import { InitiateMultipartUpload } from './InitiateMultipartUpload'
import { DeleteMultipartUpload } from './DeleteMultipartUpload'
import { ResumeInterruptedUpload } from './ResumeInterruptedUpload'
import { ReuseS3Object } from './ReuseS3Object'
import { Global } from './Global'
import {
  ABORTED,
  PAUSED,
  EVAPORATING,
  ACTIVE_STATUSES,
  CANCELED,
  PAUSING,
  PENDING,
  COMPLETE,
  FAR_FUTURE,
  ETAG_OF_0_LENGTH_BLOB,
  ERROR
} from './Constants'
import {
  extend,
  defer,
  readableFileSize,
  removeAtIndex,
  uploadKey,
  dateISOString,
  saveUpload,
  getSavedUploads,
  removeUpload,
  elementText
} from './Utils'

class FileUpload {
  public fileTotalBytesUploaded: any = 0
  public s3Parts: any = []
  public partsOnS3: any = []
  public partsInProcess: any = []
  public partsToUpload: any = []
  public numParts: any = -1
  public con: any
  public evaporate: any
  public localTimeOffset: any = 0
  public deferredCompletion: any
  public id: any
  public name: any
  public signParams: any
  public loaded: any = 0
  public sizeBytes: any
  public totalUploaded: any = 0
  public startTime: any
  public status: any = PENDING
  public progress: any
  public progressInterval: any
  public started: any
  public uploadId: any
  public firstMd5Digest: any
  public eTag: any
  public info: any
  public abortedByUser: any
  public pausing: any
  public paused: any
  public resumed: any
  public file: any
  public complete: any
  public warn: any
  public nameChanged: any
  public lastPartSatisfied: any = Promise.resolve('onStart')
  public cancelled: any
  public uploadInitiated: any

  constructor(file, con, evaporate) {
    this.fileTotalBytesUploaded = 0
    this.s3Parts = []
    this.partsOnS3 = []
    this.partsInProcess = []
    this.partsToUpload = []
    this.numParts = -1
    this.con = extend({}, con)
    this.evaporate = evaporate
    this.localTimeOffset = evaporate.localTimeOffset
    this.deferredCompletion = defer()
    extend(this, file)
    this.id = decodeURIComponent(`${this.con.bucket}/${this.name}`)
    this.signParams = con.signParams
  }

  updateLoaded(loadedNow) {
    this.loaded += loadedNow
    this.fileTotalBytesUploaded += loadedNow
  }

  progessStats() {
    // Adapted from https://github.com/fkjaekel
    // https://github.com/TTLabs/EvaporateJS/issues/13
    if (this.fileTotalBytesUploaded === 0) {
      return {
        speed: 0,
        readableSpeed: '',
        loaded: 0,
        totalUploaded: 0,
        remainingSize: this.sizeBytes,
        secondsLeft: -1,
        fileSize: this.sizeBytes
      }
    }

    this.totalUploaded += this.loaded
    const delta = (new Date().getTime() - this.startTime) / 1000
    const avgSpeed = this.totalUploaded / delta
    const remainingSize = this.sizeBytes - this.fileTotalBytesUploaded

    const stats = {
      speed: avgSpeed,
      readableSpeed: readableFileSize(avgSpeed),
      loaded: this.loaded,
      totalUploaded: this.fileTotalBytesUploaded,
      remainingSize,
      secondsLeft: -1,
      fileSize: this.sizeBytes
    }

    if (avgSpeed > 0) {
      stats.secondsLeft = Math.round(remainingSize / avgSpeed)
    }

    return stats
  }

  onProgress() {
    if (![ABORTED, PAUSED].includes(this.status)) {
      this.progress(
        this.fileTotalBytesUploaded / this.sizeBytes,
        this.progessStats()
      )
      this.loaded = 0
    }
  }

  startMonitor() {
    clearInterval(this.progressInterval)
    this.startTime = new Date()
    this.loaded = 0
    this.totalUploaded = 0
    this.onProgress()
    this.progressInterval = setInterval(
      this.onProgress.bind(this),
      this.con.progressIntervalMS
    )
  }

  stopMonitor() {
    clearInterval(this.progressInterval)
  }

  // Evaporate proxies
  startNextFile(reason) {
    this.evaporate.startNextFile(reason)
  }

  evaporatingCnt(incr) {
    this.evaporate.evaporatingCnt(incr)
  }

  consumeRemainingSlots() {
    this.evaporate.consumeRemainingSlots()
  }

  getRemainingSlots() {
    let evapCount = this.evaporate.evaporatingCount

    if (!this.partsInProcess.length && evapCount > 0) {
      // we can use our file slot
      evapCount -= 1
    }

    return this.con.maxConcurrentParts - evapCount
  }

  start() {
    this.status = EVAPORATING
    this.startMonitor()
    this.started(this.id)

    if (this.uploadId) {
      Global.l.d('resuming FileUpload ', this.id)
      return this.consumeSlots()
    }

    const awsKey = this.name
    this.getUnfinishedFileUpload()
    const existenceOptimized =
      this.con.computeContentMd5 &&
      this.con.allowS3ExistenceOptimization &&
      typeof this.firstMd5Digest !== 'undefined' &&
      typeof this.eTag !== 'undefined'

    if (this.uploadId) {
      if (existenceOptimized) {
        return this.reuseS3Object(awsKey)
          .then(this.deferredCompletion.resolve)
          .catch(this.uploadFileFromScratch.bind(this))
      }

      this.resumeInterruptedUpload()
        .then(this._uploadComplete.bind(this))
        .catch(this.uploadFileFromScratch.bind(this))
    } else {
      this.uploadFileFromScratch('')
    }
  }

  uploadFileFromScratch(reason) {
    if (!ACTIVE_STATUSES.includes(this.status)) {
      return
    }

    Global.l.d(reason)
    this.uploadId = undefined
    return this.uploadFile(this.name)
      .then(this._uploadComplete.bind(this))
      .catch(this._abortUpload.bind(this))
  }

  _uploadComplete() {
    this.completeUpload().then(this.deferredCompletion.resolve)
  }

  stop() {
    Global.l.d('stopping FileUpload ', this.id)
    this.setStatus(CANCELED)
    this.info('Canceling uploads...')
    this.abortedByUser = true
    const self = this

    return this.abortUpload()
      .then(() => {
        throw 'User aborted the upload'
      })
      .catch(reason => {
        self.deferredCompletion.reject(reason)
      })
  }

  pause(force) {
    Global.l.d('pausing FileUpload, force:', !!force, this.id)
    let promises = []
    this.info('Pausing uploads...')
    this.status = PAUSING

    if (force) {
      this.abortParts(true)
    } else {
      promises = this.partsInProcess.map(function(p) {
        return this.s3Parts[p].awsRequest.awsDeferred.promise
      }, this)

      this.pausing()
    }

    return Promise.all(promises).then(() => {
      this.stopMonitor()
      this.status = PAUSED
      this.startNextFile('pause')
      this.paused()
    })
  }

  resume() {
    this.status = PENDING
    this.resumed()
  }

  done() {
    clearInterval(this.progressInterval)
    this.startNextFile('file done')
    this.partsOnS3 = []
    this.s3Parts = []
  }

  _startCompleteUpload(callComplete) {
    return function() {
      const promise = callComplete ? this.completeUpload() : Promise.resolve()
      promise.then(this.deferredCompletion.resolve.bind(this))
    }
  }

  _abortUpload() {
    if (!this.abortedByUser) {
      const self = this

      this.abortUpload().then(() => {
        self.deferredCompletion.reject(
          'File upload aborted due to a part failing to upload'
        )
      }, this.deferredCompletion.reject.bind(this))
    }
  }

  abortParts(pause) {
    const self = this
    const toAbort = this.partsInProcess.slice(0)

    toAbort.forEach(i => {
      const s3Part = self.s3Parts[i]

      if (s3Part) {
        s3Part.awsRequest.abort()

        if (pause) {
          s3Part.status = PENDING
        }

        removeAtIndex(self.partsInProcess, s3Part.partNumber)

        if (self.partsToUpload.length) {
          self.evaporatingCnt(-1)
        }
      }
    })
  }

  makeParts(firstPart?) {
    this.numParts = Math.ceil(this.sizeBytes / this.con.partSize) || 1 // issue #58
    const partsDeferredPromises = []
    const self = this

    function cleanUpAfterPart(s3Part) {
      removeAtIndex(self.partsToUpload, s3Part.partNumber)
      removeAtIndex(self.partsInProcess, s3Part.partNumber)

      if (self.partsToUpload.length) {
        self.evaporatingCnt(-1)
      }
    }

    function resolve(s3Part) {
      return () => {
        cleanUpAfterPart(s3Part)

        if (self.partsToUpload.length) {
          self.consumeRemainingSlots()
        }

        if (self.partsToUpload.length < self.con.maxConcurrentParts) {
          self.startNextFile('part resolve')
        }
      }
    }

    function reject(s3Part) {
      return () => {
        cleanUpAfterPart(s3Part)
      }
    }

    const limit = firstPart ? 1 : this.numParts

    for (let part = 1; part <= limit; part++) {
      let s3Part = this.s3Parts[part]

      if (typeof s3Part !== 'undefined') {
        if (s3Part.status === COMPLETE) {
          continue
        }
      } else {
        s3Part = this.makePart(part, PENDING, this.sizeBytes)
      }

      s3Part.awsRequest = new PutPart(this, s3Part)
      s3Part.awsRequest.awsDeferred.promise.then(
        resolve(s3Part),
        reject(s3Part)
      )
      this.partsToUpload.push(part)
      partsDeferredPromises.push(
        this.s3Parts[part].awsRequest.awsDeferred.promise
      )
    }

    return partsDeferredPromises
  }

  makePart(partNumber, status, size) {
    const s3Part = {
      status,
      loadedBytes: 0,
      loadedBytesPrevious: null,

      // issue #58
      isEmpty: size === 0,

      md5_digest: null,
      partNumber
    }

    this.s3Parts[partNumber] = s3Part
    return s3Part
  }

  setStatus(s) {
    this.status = s
  }

  createUploadFile() {
    if (this.status === ABORTED) {
      return
    }

    const fileKey = uploadKey(this)

    const newUpload = {
      awsKey: this.name,
      bucket: this.con.bucket,
      uploadId: this.uploadId,
      fileSize: this.sizeBytes,
      fileType: this.file.type,
      lastModifiedDate: dateISOString(this.file.lastModified),
      partSize: this.con.partSize,
      signParams: this.con.signParams,
      createdAt: new Date().toISOString()
    }

    saveUpload(fileKey, newUpload)
  }

  updateUploadFile(updates) {
    const fileKey = uploadKey(this)
    const uploads = getSavedUploads()
    const upload = extend({}, uploads[fileKey], updates)
    saveUpload(fileKey, upload)
  }

  completeUploadFile(xhr) {
    const uploads = getSavedUploads()
    const upload = uploads[uploadKey(this)]

    if (typeof upload !== 'undefined') {
      upload.completedAt = new Date().toISOString()
      upload.eTag = this.eTag
      upload.firstMd5Digest = this.firstMd5Digest
      uploads[uploadKey(this)] = upload
      Global.historyCache.setItem('awsUploads', JSON.stringify(uploads))
    }

    this.complete(xhr, this.name, this.progessStats())
    this.setStatus(COMPLETE)
    this.onProgress()
  }

  removeUploadFile() {
    if (typeof this.file !== 'undefined') {
      removeUpload(uploadKey(this))
    }
  }

  getUnfinishedFileUpload() {
    const savedUploads = getSavedUploads(true)
    const u = savedUploads[uploadKey(this)]

    if (this.canRetryUpload(u)) {
      this.uploadId = u.uploadId
      this.name = u.awsKey
      this.eTag = u.eTag
      this.firstMd5Digest = u.firstMd5Digest
      this.signParams = u.signParams
    }
  }

  canRetryUpload(u) {
    // Must be the same file name, file size, last_modified, file type as previous upload
    if (typeof u === 'undefined') {
      return false
    }

    const completedAt = new Date(u.completedAt || FAR_FUTURE)

    // check that the part sizes and bucket match, and if the file name of the upload
    // matches if onlyRetryForSameFileName is true
    return (
      this.con.partSize === u.partSize &&
      completedAt > Global.HOURS_AGO &&
      this.con.bucket === u.bucket &&
      (this.con.onlyRetryForSameFileName ? this.name === u.awsKey : true)
    )
  }

  partSuccess(eTag, putRequest) {
    const part = putRequest.part
    Global.l.d(putRequest.request.step, 'ETag:', eTag)

    if (part.isEmpty || eTag !== ETAG_OF_0_LENGTH_BLOB) {
      // issue #58
      part.eTag = eTag

      part.status = COMPLETE
      this.partsOnS3.push(part)
      return true
    } else {
      part.status = ERROR
      putRequest.resetLoadedBytes()

      const msg = [
        'eTag matches MD5 of 0 length blob for part #',
        putRequest.partNumber,
        'Retrying part.'
      ].join(' ')

      Global.l.w(msg)
      this.warn(msg)
    }
  }

  listPartsSuccess(listPartsRequest, partsXml) {
    this.info(
      'uploadId',
      this.uploadId,
      'is not complete. Fetching parts from part marker',
      listPartsRequest.partNumberMarker
    )

    partsXml = partsXml.replace(/(\r\n|\n|\r)/gm, '') // strip line breaks to ease the regex requirements
    const partRegex = /<Part>(.+?)<\/Part\>/g

    while (true) {
      const cp = (partRegex.exec(partsXml) || [])[1]

      if (!cp) {
        break
      }

      const partSize = parseInt(elementText(cp, 'Size'), 10)
      this.fileTotalBytesUploaded += partSize

      this.partsOnS3.push({
        eTag: elementText(cp, 'ETag').replace(/&quot;/g, '"'),
        partNumber: parseInt(elementText(cp, 'PartNumber'), 10),
        size: partSize,
        LastModified: elementText(cp, 'LastModified')
      })
    }

    return elementText(partsXml, 'IsTruncated') === 'true'
      ? elementText(partsXml, 'NextPartNumberMarker')
      : undefined
  }

  makePartsfromPartsOnS3() {
    if (!ACTIVE_STATUSES.includes(this.status)) {
      return
    }

    this.nameChanged(this.name)

    this.partsOnS3.forEach(cp => {
      const uploadedPart = this.makePart(
        cp.partNumber,
        COMPLETE,
        cp.size
      ) as any
      uploadedPart.eTag = cp.eTag
      uploadedPart.loadedBytes = cp.size
      uploadedPart.loadedBytesPrevious = cp.size
      uploadedPart.finishedUploadingAt = cp.LastModified
    })
  }

  completeUpload() {
    const self = this

    return new CompleteMultipartUpload(this).send().then(xhr => {
      self.eTag = elementText(xhr.responseText, 'ETag').replace(/&quot;/g, '"')
      self.completeUploadFile(xhr)
    })
  }

  getCompletedPayload() {
    const completeDoc = []
    completeDoc.push('<CompleteMultipartUpload>')

    this.s3Parts.forEach((part, partNumber) => {
      if (partNumber > 0) {
        ;[
          '<Part><PartNumber>',
          partNumber,
          '</PartNumber><ETag>',
          part.eTag,
          '</ETag></Part>'
        ].forEach(a => {
          completeDoc.push(a)
        })
      }
    })

    completeDoc.push('</CompleteMultipartUpload>')
    return completeDoc.join('')
  }

  consumeSlots() {
    if (this.partsToUpload.length === 0) {
      return -1
    }

    if (
      this.partsToUpload.length !== this.partsInProcess.length &&
      this.status === EVAPORATING
    ) {
      const partsToUpload = Math.min(
        this.getRemainingSlots(),
        this.partsToUpload.length
      )

      if (!partsToUpload) {
        return -1
      }

      let satisfied = 0

      for (let i = 0; i < this.partsToUpload.length; i++) {
        const s3Part = this.s3Parts[this.partsToUpload[i]]

        if (s3Part.status === EVAPORATING) {
          continue
        }

        if (this.canStartPart(s3Part)) {
          if (this.partsInProcess.length && this.partsToUpload.length > 1) {
            this.evaporatingCnt(+1)
          }

          this.partsInProcess.push(s3Part.partNumber)
          const awsRequest = s3Part.awsRequest
          this.lastPartSatisfied.then(awsRequest.delaySend.bind(awsRequest))
          this.lastPartSatisfied = awsRequest.getStartedPromise()
        } else {
          continue
        }

        satisfied += 1

        if (satisfied === partsToUpload) {
          break
        }
      }

      const allInProcess =
        this.partsToUpload.length === this.partsInProcess.length
      const remainingSlots = this.getRemainingSlots()

      if (allInProcess && remainingSlots > 0) {
        // We don't need any more slots...
        this.startNextFile('consume slots')
      }

      return remainingSlots
    }

    return 0
  }

  canStartPart(part) {
    return (
      !this.partsInProcess.includes(part.partNumber) &&
      !part.awsRequest.errorExceptionStatus()
    )
  }

  uploadFile(awsKey) {
    this.removeUploadFile()
    const self = this

    return new InitiateMultipartUpload(self, awsKey).send().then(() => {
      self.uploadInitiated(self.uploadId)
      self.partsToUpload = []

      return self.uploadParts().then(
        () => {},
        reason => {
          throw reason
        }
      )
    })
  }

  uploadParts() {
    this.loaded = 0
    this.totalUploaded = 0

    if (!ACTIVE_STATUSES.includes(this.status)) {
      return Promise.reject(
        'Part uploading stopped because the file was canceled'
      )
    }

    const promises = this.makeParts()
    this.setStatus(EVAPORATING)
    this.startTime = new Date()
    this.consumeSlots()
    return Promise.all(promises)
  }

  abortUpload() {
    return new Promise((resolve, reject) => {
      if (typeof this.uploadId === 'undefined') {
        resolve()
        return
      }

      new DeleteMultipartUpload(this).send().then(resolve, reject)
    }).then(() => {
      this.setStatus(ABORTED)
      this.cancelled()
      this.removeUploadFile()
    }, this.deferredCompletion.reject.bind(this))
  }

  resumeInterruptedUpload() {
    return new ResumeInterruptedUpload(this)
      .send()
      .then(this.uploadParts.bind(this))
  }

  reuseS3Object(awsKey) {
    const self = this

    // Attempt to reuse entire uploaded object on S3
    this.makeParts(1)

    this.partsToUpload = []
    const firstS3Part = this.s3Parts[1]

    function reject(reason) {
      self.name = awsKey
      throw reason
    }

    return firstS3Part.awsRequest.getPartMd5Digest().then(() => {
      if (self.firstMd5Digest === firstS3Part.md5_digest) {
        return new ReuseS3Object(self, awsKey)
          .send()
          .then(xhr => {
            Global.l.d('headObject found matching object on S3.')
            self.completeUploadFile(xhr)
            self.nameChanged(self.name)
          })
          .catch(reject)
      } else {
        const msg = self.con.allowS3ExistenceOptimization
          ? "File's first part MD5 digest does not match what was stored."
          : 'allowS3ExistenceOptimization is not enabled.'
        reject(msg)
      }
    })
  }
}

export { FileUpload }
