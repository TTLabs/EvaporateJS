module.exports = function (bucket = 'bucket', key = 'test.txt') {
  return `
    <?xml version="1.0" encoding="UTF-8"?>
    <InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
      <Bucket>${bucket}</Bucket>
      <Key>${key}</Key>
      <UploadId>Hzr2sK034dOrV4gMsYK.MMrtWIS8JVBPKgeQ.LWd6H8V2PsLecsBqoA1cG1hjD3G4KRX_EBEwxWWDu8lNKezeA--</UploadId>
    </InitiateMultipartUploadResult>
  `
}
