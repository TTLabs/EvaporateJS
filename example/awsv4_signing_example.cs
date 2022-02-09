using System.Globalization;
using System.Net.Mime;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;

namespace EvaporateJSTest.Controllers;

[ApiController]
[Route("signAuth")]
public class AWSV4SigningExample : Controller
{
    private string AwsSecretKey => "YOUR AWS SECRET KEY";
    private string Region => "YOUR BUCKET REGION"; // e.g. "us-west-1"
    private string Service => "s3";

    [HttpGet()]
    public IActionResult Get(string to_sign, string datetime)
    {
        var content = SignData(AwsSecretKey, to_sign, datetime.Substring(0, 8), Region, Service);
        return Content(content,  MediaTypeNames.Text.Plain);
    }

    private static string SignData(string awsSecretKey, string to_sign, string dateStamp, string region, string service)
    {
        var sig = GetSignatureKey(awsSecretKey, dateStamp, region, service);
        var signature = HmacSha256Hash(to_sign, sig);
        var signatureAsBytes = ToHex(signature, true);
        return signatureAsBytes;
    }

    private static byte[] GetSignatureKey(string key, string dateStamp, string regionName, string serviceName)
    {
        var kSecret = Encoding.UTF8.GetBytes(("AWS4" + key).ToCharArray());
        var kDate = HmacSha256Hash(dateStamp, kSecret);
        var kRegion = HmacSha256Hash(regionName, kDate);
        var kService = HmacSha256Hash(serviceName, kRegion);
        var kSigning = HmacSha256Hash("aws4_request", kService);

        return kSigning;
    }

    private static byte[] HmacSha256Hash(string data, byte[] key)
    {
        var algorithm = "HmacSHA256";
        var kha = KeyedHashAlgorithm.Create(algorithm);
        kha.Key = key;

        return kha.ComputeHash(Encoding.UTF8.GetBytes(data));
    }

    private static string ToHex(byte[] data, bool lowercase)
    {
        var sb = new StringBuilder();

        foreach (var b in data)
        {
            sb.Append(b.ToString(lowercase ? "x2" : "X2", CultureInfo.InvariantCulture));
        }

        return sb.ToString();
    }
}