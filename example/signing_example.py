# example for google app engine

import os
import webapp2

# needed to sign S3 policy
import base64
import hmac, sha

# get your AWS_SECRET_KEY from somewhere...
# from foo import AWS_SECRET_KEY

class SignAuth(webapp2.RequestHandler):

   def get(self):
      to_sign = str(self.request.get('to_sign'))
      signature = base64.b64encode(hmac.new('YOUR_AWS_SECRET_KEY', to_sign, sha).digest())
      self.response.headers['Content-Type'] = "text/HTML"
      self.response.out.write(signature)

app = webapp2.WSGIApplication([
  ('/sign_auth',SignAuth)
],debug = True)