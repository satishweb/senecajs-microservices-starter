'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var lodash = require('lodash');
var Promise = require('bluebird');
var microtime = require('microtime');
var Invitation = null;

/**
 * @module validateInvitation
 */

/**
 * Check if the invitation is pending in database or has already been used
 * @method checkInDB
 * @param {String} token The input token
 * @param {Object} decodedToken The decoded token to get the email Id and the organization Id
 * @returns {Promise} Promise containing fetched invitation document if successful, else containing the error message
 */
function checkInDB(token, decodedToken) {
    return new Promise(function (resolve, reject) {
        
        // fetch invitation matching the email Id, organization Id and token
        Invitation.findOne({ email: decodedToken.email, orgId: decodedToken.orgId, token: token })
            .then(function (findResponse) {
                // if no document is found return message for invitation used
                if (lodash.isEmpty(findResponse)) {
                    reject({
                        id: 400, msg: err || 'Invalid invitation or already used. Please ask admin to send invitation' +
                        ' again if not registered yet.'
                    });
                } else {
                    resolve(findResponse)
                }
            })
            .catch(function (err) {
                reject({ id: 400, msg: err });
            });
    });
}

/**
 * If invitation is valid and found in database, create a reset password token by calling forgot password
 * @method callForgotPassword
 * @param {Object} decodedToken The decoded token used to get the email Id and the organization Id
 * @param {Object} header The complete headers forwarded to get the origin URL in forgotPassword
 * @param {Seneca} seneca The seneca instance
 * @returns {Promise} Promise containing the output of forgotPassword(reset URL and reset token) if successful, else
 * containing the error message
 */
function callForgotPassword(decodedToken, header, seneca) {
    return new Promise(function (resolve, reject) {
        utils.microServiceCall(seneca, 'authentication', 'forgotPassword', {email: decodedToken.email, orgId: decodedToken.orgId, fromInvitation: true}, header, function (err, result){
            if (err) {
                reject(err);
            } else {
                resolve(result.content.data);
            }
        });
    });
}

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {String} result The final result to be returned, contains the token created
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    // if the invitation is valid and reset URL and token is returned by forgot password, return them
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content   : outputFormatter.format(true, 2220, result, 'Invitation')
        });
    } else {
        //else return error
        done(null, {
            statusCode: 200,
            content   : outputFormatter.format(false, 102)
        });
    }
}

/**
 * This is a POST action for the Invitation microservice
 * It validates the invitation token and checks if its stored in database, then calls forgot password to create a reset
 * token for it to be used to reset the password by the invited user
 * @param {Object} options Contains the seneca instance
 */
module.exports = function (options) {
    var seneca = options.seneca;
    return function (args, done) {

        // load mongoose model for invitations
        Invitation = Invitation || mongoose.model('Invitations');
        var decodedToken = null;    // stores the decoded token
        
        // verify and decode the input invitation token and pass an error message if invalid
        utils.verifyTokenAndDecode(args.header.authorization, 'Invalid invitation. Invitation might have expired. ' +
            'Please ask admin to resend invite.')
            .then(function (response) {
                decodedToken = response;    // save the decoded token details
                
                // check if the invitation is present in the database or has already been used
                return checkInDB(args.header.authorization, response)
            })
            .then(function () {
                // call forgot password to create a reset token
                return callForgotPassword(decodedToken, args.header, seneca);
            })
            .then(function (response) {
                return sendResponse(response, done);
            })
            .catch(function (err) {
                
                // in case of error, print the error and send as response
                utils.senecaLog(seneca, 'error', __filename.split('/').pop(), err);

                // if the error message is formatted, send it as reply, else format it and then send
                done(null,
                    {
                        statusCode: 200,
                        content   : err.success === true || err.success === false ? err :
                            utils.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                    });
            });
    };
};