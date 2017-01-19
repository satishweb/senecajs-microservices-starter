'use strict';

var utils = require(__base + 'sharedlib/utils');
var authentication = require(__base + 'sharedlib/authentication');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__dirname + '/../');
var lodash = require('lodash');
var mongoose = require('mongoose');
var Promise = require('bluebird');
var microtime = require('microtime');
var Token = null;

/**
 * @module validateResetPasswordToken
 */

/**
 * Check if reset token exists in database
 * @method verifyTokenDetails
 * @param {String} token The token sent in input header to be verified
 * @returns {Promise} Promise containing the saved token details if successfully found, else containing the error
 * message
 */
function verifyTokenDetails(token) {
    return new Promise(function(resolve, reject) {
        Token.findOne({ token: token }, function(err, findResponse) {
            if (err || lodash.isEmpty(findResponse)) {
                reject({ id: 400, msg: err || 'Reset Password Token not found' });
            } else {
                resolve(findResponse)
            }
        })
    });
}


/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {String} result The final result to be returned, contains the token created
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2220, result, 'Reset Password Token')
        });
    } else {
        //else return error
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
}


module.exports = function(options) {
    var seneca = options.seneca;
    return function(args, done) {
        Token = Token || mongoose.model('Tokens');

        // check if input token is valid
        authentication.verifyTokenAndDecode(args.header.authorization)
            .then(function() {
                // check if token is stored in database
                return verifyTokenDetails(args.header.authorization)
            })
            .then(function(response) {
                return sendResponse(response, done);
            })
            .catch(function(err) {
                seneca.log.error('[ ' + process.env.SRV_NAME + ': ' + __filename.split('/').slice(-1) + ' ]', "ERROR" +
                  " : ", err);
                done(null, {
                    statusCode: 200,
                    content: err.success === true || err.success === false ? err :
                      utils.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};