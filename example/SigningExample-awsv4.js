#!/usr/bin/env node

// To run:
//  - set environment variables (AWS_SECRET, AWS_SERVICE, AWS_REGION)
//  - $ npm install express body-parser
//  - $ ./SigningExample-awsv4.js
//  - navigate to http://127.0.0.1:3000/ and set variables on the page

var express = require('express');
var bodyParser = require('body-parser');
var crypto = require('crypto');

// -------- Crypto helpers ----------
function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest();
}

function hexhmac(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest('hex');
}

// ------ Create express server ------
var app = express();

// -------- Configure middleware ------
app.use(express.static(require('path').join( __dirname + '/../')));

app.use(function(req, res, next) {
  // Basic request logging middleware
  console.log(req.method + ' ' + req.originalUrl);
  next();
});

app.use(bodyParser.urlencoded({
  extended: true
}));

// ------ Configure routes ----------
app.use('/signv4_auth', function (req, res) {
  const timestamp = req.query.datetime.substr(0, 8);

  const date = hmac('AWS4' + process.env.AWS_SECRET, timestamp);
  const region = hmac(date, process.env.AWS_REGION);
  const service = hmac(region, process.env.AWS_SERVICE);
  const signing = hmac(service, 'aws4_request');

  res.send(hexhmac(signing, req.query.to_sign));
});

app.get('/', function (req, res) {
  res.redirect(301, '/example/evaporate_example_awsv4_signature.html');
});

// ------- Start the server -----------
app.listen(3000, '127.0.0.1', function() {
  console.log('Listening on 127.0.0.1:3000');
  console.log(process.env.AWS_SECRET, process.env.AWS_REGION, process.env.AWS_SERVICE)
});
