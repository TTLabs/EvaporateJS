using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Mime;
using System.Security.Cryptography;
using System.Text;
using System.Web.Http;

[RoutePrefix("signAuth")]
public class SigningExampleController : ApiController
{
    [HttpGet]
    [Route("")]
    public IHttpActionResult Get([FromUri] string to_sign)
    {
        // TODO: Do something to authenticate this request
        var content = new StringContent(SignData(to_sign));
        content.Headers.ContentType = new MediaTypeHeaderValue(MediaTypeNames.Text.Plain);
        var response = new HttpResponseMessage(HttpStatusCode.OK) {Content = content};
        return ResponseMessage(response);
    }

    private static string SignData(string to_sign)
    {
        using (var signature = new HMACSHA1(key: Encoding.UTF8.GetBytes("<<YOUR_AWS_SECRET_KEY>>")))
        {
            var bytes = Encoding.UTF8.GetBytes(to_sign);
            var hash = signature.ComputeHash(bytes);
            return Convert.ToBase64String(hash);
        }
    }
}
