import { AuthorizationMethod } from './AuthorizationMethod'
import { AuthorizationCustom } from './AuthorizationCustom'
import { Global } from './Global'
import { S3_EXTRA_ENCODED_CHARS, FAR_FUTURE } from './Constants'
import { AwsSignatureV4 } from './AwsSignatureV4'
import { AwsSignatureV2 } from './AwsSignatureV2'
import { SignedS3AWSRequest } from './SignedS3AWSRequest'

function signingVersion(awsRequest: SignedS3AWSRequest) {
  const { awsSignatureVersion } = awsRequest.con

  const AwsSignature =
    awsSignatureVersion === '4' ? AwsSignatureV4 : AwsSignatureV2
  return new AwsSignature(awsRequest)
}

function authorizationMethod(awsRequest) {
  const con = awsRequest.fileUpload.con

  if (typeof con.customAuthMethod === 'function') {
    return new AuthorizationCustom(awsRequest)
  }

  return new AuthorizationMethod(awsRequest)
}

function awsUrl(con) {
  let url

  if (con.aws_url) {
    url = [con.aws_url]
  } else {
    if (con.s3Acceleration) {
      url = ['https://', con.bucket, '.s3-accelerate']
      con.cloudfront = true
    } else {
      url = ['https://', con.cloudfront ? `${con.bucket}.` : '', 's3']

      if (con.awsRegion !== 'us-east-1') {
        url.push('-', con.awsRegion)
      }
    }

    url.push('.amazonaws.com')
  }

  return url.join('')
}

function s3EncodedObjectName(fileName) {
  const fileParts = fileName.split('/')
  const encodedParts = []

  fileParts.forEach(p => {
    const buf = []
    const enc = encodeURIComponent(p)

    for (let i = 0; i < enc.length; i++) {
      buf.push(S3_EXTRA_ENCODED_CHARS[enc.charCodeAt(i)] || enc.charAt(i))
    }

    encodedParts.push(buf.join(''))
  })

  return encodedParts.join('/')
}

function uri(url) {
  let p
  const href = url || '/'

  try {
    p = new URL(href)
    p.search = p.search || ''
  } catch (e) {
    p = document.createElement('a')
    p.href = href
  }

  return {
    // => "http:"
    protocol: p.protocol,

    // => "example.com"
    hostname: p.hostname,

    // IE omits the leading slash, so add it if it's missing
    // => "/pathname/"
    pathname: p.pathname.replace(/(^\/?)/, '/'),

    // => "3000"
    port: p.port,

    // => "search=test"
    search: p.search[0] === '?' ? p.search.substr(1) : p.search,

    // => "#hash"
    hash: p.hash,

    // => "example.com:3000"
    host: p.host
  }
}

function dateISOString(date) {
  // Try to get the modified date as an ISO String, if the date exists
  return date ? new Date(date).toISOString() : ''
}

function getAwsResponse(xhr) {
  const code = elementText(xhr.responseText, 'Code')
  const msg = elementText(xhr.responseText, 'Message')
  return code.length ? ['AWS Code: ', code, ', Message:', msg].join('') : ''
}

function elementText(source, element) {
  const match = source.match(['<', element, '>(.+)</', element, '>'].join(''))
  return match ? match[1] : ''
}

function defer() {
  let deferred = {} as any
  let promise

  promise = new Promise((resolve, reject) => {
    deferred = {
      resolve,
      reject
    }
  })

  return {
    resolve: deferred.resolve,
    reject: deferred.reject,
    promise
  }
}

function extend(obj1, obj2, obj3?) {
  function ext(target, source) {
    if (typeof source !== 'object') {
      return
    }

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        target[key] = source[key]
      }
    }
  }

  obj1 = obj1 || {}
  obj2 = obj2 || {}
  obj3 = obj3 || {}
  ext(obj2, obj3)
  ext(obj1, obj2)
  return obj1
}

function getSavedUploads(purge?) {
  const uploads = JSON.parse(Global.historyCache.getItem('awsUploads') || '{}')

  if (purge) {
    for (const key in uploads) {
      if (uploads.hasOwnProperty(key)) {
        const upload = uploads[key]
        const completedAt = new Date(upload.completedAt || FAR_FUTURE)

        if (completedAt < Global.HOURS_AGO) {
          // The upload is recent, let's keep it
          delete uploads[key]
        }
      }
    }

    Global.historyCache.setItem('awsUploads', JSON.stringify(uploads))
  }

  return uploads
}

function uploadKey(fileUpload) {
  // The key tries to give a signature to a file in the absence of its path.
  // "<filename>-<mimetype>-<modifieddate>-<filesize>"
  return [
    fileUpload.file.name,
    fileUpload.file.type,
    dateISOString(fileUpload.file.lastModified),
    fileUpload.sizeBytes
  ].join('-')
}

function saveUpload(uploadKey, upload) {
  const uploads = getSavedUploads()
  uploads[uploadKey] = upload
  Global.historyCache.setItem('awsUploads', JSON.stringify(uploads))
}

function removeUpload(uploadKey) {
  const uploads = getSavedUploads()
  delete uploads[uploadKey]
  Global.historyCache.setItem('awsUploads', JSON.stringify(uploads))
}

function removeAtIndex(a, i) {
  const idx = a.indexOf(i)

  if (idx > -1) {
    a.splice(idx, 1)
    return true
  }
}

function readableFileSize(size) {
  // Adapted from https://github.com/fkjaekel
  // https://github.com/TTLabs/EvaporateJS/issues/13
  const units = ['B', 'Kb', 'Mb', 'Gb', 'Tb', 'Pb', 'Eb', 'Zb', 'Yb']

  let i = 0

  while (size >= 1024) {
    size /= 1024
    ++i
  }

  return [size.toFixed(2).replace('.00', ''), units[i]].join(' ')
}

function noOpLogger() {
  return {
    d() {},
    w() {},
    e() {}
  }
}

function getSupportedBlobSlice() {
  if (typeof Blob === 'undefined') {
    return null
  }

  const blobProperties = Object.keys(Blob.prototype)
  return blobProperties.find(key => key.toLowerCase().includes('slice'))
}

export {
  signingVersion,
  authorizationMethod,
  awsUrl,
  s3EncodedObjectName,
  uri,
  dateISOString,
  getAwsResponse,
  elementText,
  defer,
  extend,
  getSavedUploads,
  uploadKey,
  saveUpload,
  removeUpload,
  removeAtIndex,
  readableFileSize,
  noOpLogger,
  getSupportedBlobSlice
}
