#!/bin/env node
//npm install express body-parser and navigate to http://127.0.0.1:8080/index.html
var express = require('express');
var bodyParser = require('body-parser');
var crypto = require('crypto');

var app = express();
app.use(express.static(require('path').join( __dirname + '/../')));

app.use(bodyParser.urlencoded({
	extended: true
}));

app.listen(8080, '127.0.0.1');

app.use('/sign_auth', function (req, res) {
	res.send(crypto
		.createHmac('sha1', env.AWS_SECRET)
		.update(req.query.to_sign)
		.digest('base64')
	);
});

app.get('/index.html', function (req, res) {
	res.redirect(301, '/example/evaporate_example.html');
});
