# example of how to do the auth_sign for a Rails app

# model
# -*- encoding : utf-8 -*-
class AuthSign
  require 'base64'
  require 'hmac-sha1'

  def self.sign_data(details_to_sign)
    hmac = HMAC::SHA1.new(YOUR_AWS_SECRET)
    hmac.update(details_to_sign)

    Base64.encode64("#{hmac.digest}").
           gsub("\n",'')
  end
end


# controller
# -*- encoding : utf-8 -*-
class PagesController < ApplicationController
  encoded = AuthSign.sign_data(params["to_sign"])

  render :text => encoded, :status => 200 and return
end



# secret = "random_test_secret"
# data_to_sign = "joesoap"
# returns 'zEAswdrJ0mrRnwUR9znmuWTyqz4='
