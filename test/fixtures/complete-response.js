module.exports = function (bucket = 'bucket', key = 'test.txt') {
  return `
    <?xml version="1.0" encoding="UTF-8"?>
    <CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
      <Location>https://bucket.s3.amazonaws.com/${key}</Location>
      <Bucket>${bucket}</Bucket>
      <Key>${key}</Key>
      <ETag>&quot;b2969107bdcfc6aa30892ee0867ebe79-1&quot;</ETag>
    </CompleteMultipartUploadResult>
  `
}
