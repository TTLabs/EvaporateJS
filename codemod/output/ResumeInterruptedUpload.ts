import { SignedS3AWSRequestWithRetryLimit } from './SignedS3AWSRequestWithRetryLimit'
import { Global } from './Global'

//http://docs.amazonwebservices.com/AmazonS3/latest/API/mpUploadListParts.html
class ResumeInterruptedUpload extends SignedS3AWSRequestWithRetryLimit {
  public awsKey: any
  public partNumberMarker: any = 0

  constructor(fileUpload) {
    super(fileUpload)
    this.updateRequest(this.setupRequest(0))
  }

  setupRequest(partNumberMarker) {
    const msg = [
      'setupRequest() for uploadId:',
      this.fileUpload.uploadId,
      'for part marker:',
      partNumberMarker
    ].join(' ')

    Global.l.d(msg)
    this.fileUpload.info(msg)
    this.awsKey = this.fileUpload.name
    this.partNumberMarker = partNumberMarker

    const request = {
      method: 'GET',
      path: ['?uploadId=', this.fileUpload.uploadId].join(''),
      query_string: `&part-number-marker=${partNumberMarker}`,
      x_amz_headers: this.fileUpload.xAmzHeadersCommon,
      step: 'get upload parts',
      success404: true
    }

    this.request = request
    return request
  }

  success() {
    if (this.currentXhr.status === 404) {
      // Success! Upload is no longer recognized, so there is nothing to fetch
      if (
        this.rejectedSuccess(
          'uploadId ',
          this.fileUpload.id,
          ' not found on S3.'
        )
      ) {
        this.awsDeferred.resolve(this.currentXhr)
      }

      return
    }

    const nextPartNumber = this.fileUpload.listPartsSuccess(
      this,
      this.currentXhr.responseText
    )

    if (nextPartNumber) {
      const request = this.setupRequest(nextPartNumber) // let's fetch the next set of parts
      this.updateRequest(request)
      this.trySend()
    } else {
      this.fileUpload.makePartsfromPartsOnS3()
      this.awsDeferred.resolve(this.currentXhr)
    }
  }
}

export { ResumeInterruptedUpload }
