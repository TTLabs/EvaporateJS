# example of how to do the AWS V4 Signature for a Rails app

class Signingv4Controller < ApplicationController

  AWS_SERVICE = 's3'
  AWS_REGION = 'us-east-1'

  def signv4_auth
    render text: hmac_data, status: 200
  end

  def hmac_data
    aws_secret = Rails.application.secrets.AWS_SECRET || ENV['AWS_SECRET']
    timestamp = params[:datetime]

    date = hmac("AWS4#{aws_secret}", timestamp[0..7])
    region = hmac(date, AWS_REGION)
    service = hmac(region, AWS_SERVICE)
    signing = hmac(service, 'aws4_request')


    hexhmac(signing, params[:to_sign])
  end

  private

    def hmac(key, value)
      OpenSSL::HMAC.digest(OpenSSL::Digest.new('sha256'), key, value)
    end

    def hexhmac(key, value)
      OpenSSL::HMAC.hexdigest(OpenSSL::Digest.new('sha256'), key, value)
    end

end
