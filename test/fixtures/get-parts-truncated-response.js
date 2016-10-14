module.exports = function (bucket = 'bucket', key = 'test.txt', totalParts = 1, partNumberMarker) {
  let head = `
  <?xml version="1.0" encoding="UTF-8"?>
  <ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
      <Bucket>${bucket}</Bucket>
      <Key>${key}</Key>
      <UploadId>
          OdTON0ughnzEVK_MM8WO3wUC1Z8yt9iXUXB9EY4BaYh38vYFbqEz2hmbESmjiv.ChW92IVPOMvOGy5zYYjqS1nOYM__u9.bPfLbAcRoU_5w5Jv7VpA0UZYI6tPqw78wM
      </UploadId>
      <StorageClass>STANDARD</StorageClass>
      <PartNumberMarker>${partNumberMarker}</PartNumberMarker>
      <NextPartNumberMarker>${partNumberMarker + 1}</NextPartNumberMarker>
      <IsTruncated>${totalParts !==0 && (partNumberMarker + 1 !== totalParts)}</IsTruncated>`

  if (totalParts > 0) {
      head += `
        <Part>
            <PartNumber>${partNumberMarker + 1}</PartNumber>
            <LastModified>2016-10-09T22:59:39.000Z</LastModified>
            <ETag>&quot;98a2846465ef09376b0840d18830502c&quot;</ETag>
            <Size>6291456</Size>
        </Part>
  `
    }

    head += "</ListPartsResult>"

  return head
}
