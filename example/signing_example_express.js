var express = require('express'),
    crypto = require('crypto');

var app = express();

app.get('/signer', function (req, res) {
    // TODO: Do something to authenticate this request
    res.send(
        crypto
            .createHmac('sha1', 'YOUR_AWS_SECRET_KEY')
            .update(req.query.to_sign)
            .digest('base64')
    );
});

app.listen(3000);
