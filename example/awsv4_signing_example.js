#!/usr/bin/env node
//npm install express body-parser and navigate to http://127.0.0.1:8080/index.html
var express = require('express');
var bodyParser = require('body-parser');
var crypto = require('crypto');

var app = express();
app.use(express.static(require('path').join( __dirname + '/../')));

// Add simple logging middleware
app.use(function(req, res, next) {
  console.log(req.method + ' ' + req.originalUrl);
  next();
});

app.use(bodyParser.urlencoded({
	extended: true
}));

app.listen(8080, '127.0.0.1', function () {
	console.log('Listening on 127.0.0.1:8080');
});

app.use('/sign_auth', function (req, res) {
  
  const timestamp = req.query.datetime.substr(0, 8);

  const dateKey = hmac('AWS4' + process.env.AWS_SECRET, timestamp);
  const dateRegionKey = hmac(dateKey, process.env.AWS_REGION);
  const dateRegionServiceKey = hmac(dateRegionKey, 's3');
  const signingKey = hmac(dateRegionServiceKey, 'aws4_request');

  var signature = hmac(signingKey, req.query.to_sign).toString('hex');

	console.log('Created signature "' + signature + '" from ' + req.query.to_sign);
	res.send(signature);
  
  // ===========
  
  function hmac(key, string){
    crypto.createHmac('sha256', key);
      hmac.end(string);
      return hmac.read();
  }
});

app.get('/index.html', function (req, res) {
	res.redirect(301, '/example/evaporate_example.html');
});
