using System;
using System.Net.Mime;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Headers;
using System.Net.Http;
using System.Net;
using System.Text;

// This example is created by following the code snippet from here : https://docs.aws.amazon.com/general/latest/gr/signature-v4-examples.html#signature-v4-examples-dotnet
// For more information go to the link.
namespace Api.Controllers
{
    [Route("api/[controller]")]
    public class S3Controller : Controller
    {
		public const string SECRET_KEY = "SECRET_KEY";
		public const string REGION = "S3_REGION";
		public const string TERMINATOR = "aws4_request";
		public const string HMACSHA256 = "HMACSHA256";
		public const string SERVICE = "s3";
		public const string SCHEME = "AWS4";
        public S3Controller()
        {
        }

		//FRONTEND CALL Config Object
		// s3Config: {
        //         bucket: 'S3_BUCKET',
        //         awsRegion: 'S3_REGION',
        //         aws_key: 'S3_ACCESS_KEY',
        //         signerUrl: `${config.apiUrl}/s3`,
        //         awsSignatureVersion: '4',
        //         progressIntervalMS: 200,
        //         signHeaders: { ...getAuthHeader() },
        //         computeContentMd5 : true,
        //         cryptoMd5Method: function (data) { return AWS.util.crypto.md5(data, 'base64'); }, // requires aws-sdk js package
        //         cryptoHexEncodedHash256: function (data) { return AWS.util.crypto.sha256(data, 'hex'); } // requires aws-sdk js package
        //     }
		
        [HttpGet]
        [Route("")]
        public string Get([FromQuery] string to_sign, string datetime)
        {
			// Only keep the date portion. Allowed format : yyyyMMdd
			string dateStamp = datetime.Substring(0, 8);
            return ComputeSignature(to_sign, dateStamp);
        }
        private string ComputeSignature(string to_sign, string dateStamp)
        {
            // compute the signing key
            var kha = KeyedHashAlgorithm.Create(HMACSHA256);
            kha.Key = DeriveSigningKey(HMACSHA256, SECRET_KEY, REGION, dateStamp, SERVICE);

            // compute the AWS4 signature and return it. 
			// (You have to resign the URL with the key. This part is important)
            var signature = kha.ComputeHash(Encoding.UTF8.GetBytes(to_sign.ToString()));
			
			// Any other byte array to Hex string method can be used here. Remember to use lowercase and remove "-" characters.
            var signatureString = ToHexString(signature, true);
            return signatureString;
        }

		/// <summary>
        /// Compute and return the multi-stage signing key for the request.
        /// </summary>
        /// <param name="algorithm">Hashing algorithm to use</param>
        /// <param name="awsSecretAccessKey">The clear-text AWS secret key</param>
        /// <param name="region">The region in which the service request will be processed</param>
        /// <param name="date">Date of the request, in yyyyMMdd format</param>
        /// <param name="service">The name of the service being called by the request</param>
        /// <returns>Computed signing key</returns>
        private byte[] DeriveSigningKey(string algorithm, string awsSecretAccessKey, string region, string date, string service)
        {
            const string ksecretPrefix = SCHEME;
            char[] ksecret = null;

            ksecret = (ksecretPrefix + awsSecretAccessKey).ToCharArray();

            byte[] hashDate = ComputeKeyedHash(algorithm, Encoding.UTF8.GetBytes(ksecret), Encoding.UTF8.GetBytes(date));
            byte[] hashRegion = ComputeKeyedHash(algorithm, hashDate, Encoding.UTF8.GetBytes(region));
            byte[] hashService = ComputeKeyedHash(algorithm, hashRegion, Encoding.UTF8.GetBytes(service));
            return ComputeKeyedHash(algorithm, hashService, Encoding.UTF8.GetBytes(TERMINATOR));
        }

		/// <summary>
        /// Compute and return the hash of a data blob using the specified algorithm
        /// and key
        /// </summary>
        /// <param name="algorithm">Algorithm to use for hashing</param>
        /// <param name="key">Hash key</param>
        /// <param name="data">Data blob</param>
        /// <returns>Hash of the data</returns>
        private byte[] ComputeKeyedHash(string algorithm, byte[] key, byte[] data)
        {
            var kha = KeyedHashAlgorithm.Create(algorithm);
            kha.Key = key;
            return kha.ComputeHash(data);
        }

		/// <summary>
        /// Helper to format a byte array into string
        /// </summary>
        /// <param name="data">The data blob to process</param>
        /// <param name="lowercase">If true, returns hex digits in lower case form</param>
        /// <returns>String version of the data</returns>
        private string ToHexString(byte[] data, bool lowercase)
        {
            var sb = new StringBuilder();
            for (var i = 0; i < data.Length; i++)
            {
                sb.Append(data[i].ToString(lowercase ? "x2" : "X2"));
            }
            return sb.ToString();
        }
    }
}
