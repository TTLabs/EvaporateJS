#!/bin/env node
// set environment variables, set variables in awsv4 example html,
// run npm install express body-parser and navigate to http://locallhost:3000/
// based on ruby example

var express = require('express');
var bodyParser = require('body-parser');
var crypto = require('crypto');

var app = express();
app.use(express.static(require('path').join( __dirname + '/../')));


function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest();
}

function hexhmac(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest('hex');
}


app.use(bodyParser.urlencoded({
	extended: true
}));

app.listen(3000, '127.0.0.1');

app.use('/signv4_auth', function (req, res) {
  const timestamp = req.query.datetime.substr(0, 8);

  const date = hmac('AWS4' + env.AWS_SECRET, timestamp);
  const region = hmac(date, env.AWS_REGION);
  const service = hmac(region, env.AWS_SERVICE);
  const signing = hmac(service, 'aws4_request');

  res.send(hexhmac(signing, req.query.to_sign));
});

app.get('/', function (req, res) {
	res.redirect(301, '/example/evaporate_example_awsv4_signature.html');
});
