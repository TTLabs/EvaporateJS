# example for google app engine

import webapp2

# needed to sign S3 policy
import base64
import hashlib
import hmac

# get YOUR_AWS_SECRET_KEY from somewhere...
# from foo import YOUR_AWS_SECRET_KEY


class SignAuth(webapp2.RequestHandler):

    def get(self):
        # TODO: Do something to authenticate this request
        to_sign = str(self.request.get('to_sign')).encode('utf-8')
        signature = base64.b64encode(
            hmac.new(b'YOUR_AWS_SECRET_KEY', to_sign, hashlib.sha1).digest())
        self.response.headers['Content-Type'] = "text/HTML"
        self.response.out.write(signature)

app = webapp2.WSGIApplication([
    ('/sign_auth', SignAuth)
], debug=True)
