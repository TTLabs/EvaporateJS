# example for google app engine

import webapp2

# needed to sign S3 policy
import datetime
import hashlib
import hmac

# get AWS details from somewhere...
# from foo import YOUR_AWS_SECRET_KEY
# from foo import YOUR_AWS_REGION


class SignAuth(webapp2.RequestHandler):

    def get(self):
        to_sign = str(self.request.get('to_sign')).encode('utf-8')
        
        aws_secret = YOUR_AWS_SECRET_KEY
        date_stamp = datetime.datetime.strptime(self.request.get('datetime'), '%Y%m%dT%H%M%SZ').strftime('%Y%m%d')
        region = YOUR_AWS_REGION
        service = 's3'

        # Key derivation functions. See:
        # http://docs.aws.amazon.com/general/latest/gr/signature-v4-examples.html#signature-v4-examples-python
        def sign(key, msg):
            return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

        def getSignatureKey(key, date_stamp, regionName, serviceName):
            kDate = sign(('AWS4' + key).encode('utf-8'), date_stamp)
            kRegion = sign(kDate, regionName)
            kService = sign(kRegion, serviceName)
            kSigning = sign(kService, 'aws4_request')
            return kSigning

        signing_key = getSignatureKey(aws_secret, date_stamp, region, service)

        # Sign to_sign using the signing_key
        signature = hmac.new(
            signing_key,
            to_sign,
            hashlib.sha256
        ).hexdigest()

        self.response.headers['Content-Type'] = "text/HTML"
        self.response.out.write(signature)

app = webapp2.WSGIApplication([
    ('/sign_auth', SignAuth)
], debug=True)
