# example for google app engine

import logging
import os
from google.appengine.ext import webapp
from google.appengine.ext.webapp.util import run_wsgi_app

#needed to sign S3 policy
import base64
import hmac, sha

#get your AWS_SECRET_KEY from somewhere...
from foo import AWS_SECRET_KEY




class SignAuth(webapp.RequestHandler):
   def get(self):
   
      to_sign = str(self.request.get('to_sign'))
      signature = base64.b64encode(hmac.new(AWS_SECRET_KEY, to_sign, sha).digest())
      self.response.headers['Content-Type'] = "text/HTML"
      self.response.out.write(signature)

      
        
def testing():
   logging.getLogger().setLevel(logging.DEBUG)
   application = webapp.WSGIApplication(
      [
         ('/testing/sign_auth',SignAuth)
      ],debug = True)
   run_wsgi_app(application)

if __name__ == "__main__":
   testing()