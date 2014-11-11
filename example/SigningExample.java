import java.io.IOException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.apache.commons.codec.binary.Base64;
import org.apache.commons.lang3.StringUtils;

@WebServlet("/signAuth")
public class SigningExample extends HttpServlet
{
    private static final long   serialVersionUID    = 1L;

    private static final String HMAC_SHA1_ALGORITHM = "HmacSHA1";

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException
    {
        String data = request.getParameter("to_sign");

        if(StringUtils.isEmpty(data))
        {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "Invalid data: 'to_sign' parameter not informed");
        }
        else
        {
            response.getWriter().write(calculateRFC2104HMAC(data, "<<YOUR_AWS_SECRET_KEY>>"));
        }
    }

    /**
     * http://docs.aws.amazon.com/AmazonSimpleDB/latest/DeveloperGuide/HMACAuth.html#AuthJavaSampleHMACSignature
     * 
     * Computes RFC 2104-compliant HMAC signature.
     * 
     * @param data
     *           The data to be signed.
     * @param key
     *           The signing key.
     * @return The Base64-encoded RFC 2104-compliant HMAC signature.
     * @throws ServletException
     * @throws java.security.SignatureException
     *            when signature generation fails
     */
    public static String calculateRFC2104HMAC(String data, String key) throws ServletException
    {
        String result;
        try
        {
            // get an hmac_sha1 key from the raw key bytes
            SecretKeySpec signingKey = new SecretKeySpec(key.getBytes(), HMAC_SHA1_ALGORITHM);

            // get an hmac_sha1 Mac instance and initialize with the signing key
            Mac mac = Mac.getInstance(HMAC_SHA1_ALGORITHM);
            mac.init(signingKey);

            // compute the hmac on input data bytes
            byte[] rawHmac = mac.doFinal(data.getBytes());

            // base64-encode the hmac
            result = new String(Base64.encodeBase64(rawHmac));
        }
        catch(Exception e)
        {
            throw new ServletException("Failed to generate HMAC: " + e.getMessage());
        }
        return result;
    }
}
