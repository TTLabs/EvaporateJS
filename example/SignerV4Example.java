package example;

import java.io.IOException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.apache.commons.lang3.StringUtils;

import org.apache.commons.codec.binary.Hex;

/**
 * Servlet implementation class SignerV4Example
 */
public class SignerV4Example extends HttpServlet {
	private static final long serialVersionUID = 1L;
	private static final String  SECRET_KYE = "your-secret-key";
	private static final String  REGION = "your-region";
	private static final String  SERVICE_NAME = "s3";
	
	
       
    public SignerV4Example() {
        super();
    }


	protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {

		String data = request.getParameter("to_sign");
		String dateStamp = request.getParameter("datetime").
				substring(0, 8);
		
		 if(StringUtils.isEmpty(data)) {
	            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "Invalid data: 'to_sign' parameter not informed");
	        } else {
	            try {
					response.getWriter().write(
							getSignatureKey(getSignatureKey(SECRET_KYE, dateStamp, REGION, SERVICE_NAME,data))
							);
				} catch (Exception e) {
					e.printStackTrace();
				}
	        }
		
	}

	protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		doGet(request, response);
	}
	
	static byte[] HmacSHA256(String data, byte[] key) throws Exception {
	    String algorithm="HmacSHA256";
	    Mac mac = Mac.getInstance(algorithm);
	    mac.init(new SecretKeySpec(key, algorithm));
	    return mac.doFinal(data.getBytes("UTF-8"));
	}
	
	public static String getSignatureKey(byte[] signer) {
		return  Hex.encodeHexString(signer);
	}

	static byte[] getSignatureKey(String secretKey, String dateStamp, String regionName, String serviceName, String toSign) throws Exception {
	    byte[] kSecret = ("AWS4" + secretKey).getBytes("UTF-8");
	    byte[] kDate = HmacSHA256(dateStamp, kSecret);
	    byte[] kRegion = HmacSHA256(regionName, kDate);
	    byte[] kService = HmacSHA256(serviceName, kRegion);
	    byte[] kSigning = HmacSHA256("aws4_request", kService);
	    byte[] dataSigning = HmacSHA256(toSign, kSigning);
	    return dataSigning;
	}

}
