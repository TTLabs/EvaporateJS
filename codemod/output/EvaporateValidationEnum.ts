export enum EvaporateValidationEnum {
  MISSING_SUPPORT_FILE_PROMISE = 'Evaporate requires support for File and Promise',
  MISSING_READABLE_STREAM_PART_METHOD = 'Option readableStreamPartMethod is required when readableStreams is set.',
  MISSING_SUPPORT_BLOB = 'Evaporate requires support for Blob [webkitSlice || mozSlice || slice]',
  MISSING_SIGNER_URL = 'Option signerUrl is required unless customAuthMethod is present.',
  MISSING_BUCKET = "The AWS 'bucket' option must be present.",
  MISSING_SUPPORT_READ_AS_ARRAY_BUFFER = "The browser's FileReader object does not support readAsArrayBuffer",
  MISSING_COMPUTE_CONTENT_MD5 = 'Option computeContentMd5 has been set but cryptoMd5Method is not defined.',
  MISSING_V4_CRYPTO_HEX_ENCODED_HASH256 = 'Option awsSignatureVersion is 4 but cryptoHexEncodedHash256 is not defined.',
  MISSING_V4_COMPUTE_CONTENT_MD5 = 'Option awsSignatureVersion is 4 but computeContentMd5 is not enabled.',
  OK = 'OK'
}
