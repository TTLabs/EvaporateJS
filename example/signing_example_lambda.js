var crypto = require('crypto');
var secret = 'YOUR_AWS_SECRET_KEY';

exports.handler = function (event, context) {
    if (!event.to_sign) {
        context.fail('Missing to_sign param');
        return;
    }
    // TODO: Do something with event.sign_params to authenticate this request
    context.succeed(
        crypto.createHmac('sha1', secret)
            .update(event.to_sign)
            .digest('base64')
    );
};
