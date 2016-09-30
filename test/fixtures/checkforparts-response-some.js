module.exports = function (bucket = 'bucket', key = 'test.txt') {
  return `
  <?xml version="1.0" encoding="UTF-8"?>
  <ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Bucket>${bucket}</Bucket>
    <Key>${key}</Key>
    <Part>
      <PartNumber>2</PartNumber>
      <Size>10485760</Size>
    </Part>
    <Part>
      <PartNumber>3</PartNumber>
      <Size>10485760</Size>
    </Part>
  </ListPartsResult>
  `
}
