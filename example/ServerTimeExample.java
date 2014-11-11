import java.io.IOException;
import java.util.Date;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.apache.http.impl.cookie.DateUtils;

@WebServlet("/serverTime")
public class ServerTimeExample extends HttpServlet
{
	private static final long serialVersionUID = 1L;

	/**
	 * Output the date in the RFC 1123, same output from JavaScript new Date().toUTCString()
	 * In case you don't have or can't add Apache HttpClient library to your project, the pattern is EEE, dd MMM yyyy HH:mm:ss zzz
	 * 
	 * @param req
	 * @param resp
	 * @throws ServletException
	 * @throws IOException
	 */
	@Override
	protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException
	{
		resp.getWriter().write(DateUtils.formatDate(new Date()));
	}
}
