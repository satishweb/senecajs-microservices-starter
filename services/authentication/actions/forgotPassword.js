'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var jwt = require('jsonwebtoken');
var microtime = require('microtime');
var url = require('url');
var User = null;
var Organization = null;
var Token = null;
var expireTime = process.env.RESET_PASS_EXPIRY_TIME || '2d'; // expiry time of token sent in redirect URL

/**
 * @module forgotPassword
 */

//Joi validation Schema
var forgotPasswordSchema = Joi.object().keys({
    email: Joi.string().regex(/^\s*[\w\-\+​_]+(\.[\w\-\+_​]+)*\@[\w\-\+​_]+\.[\w\-\+_​]+(\.[\w\-\+_]+)*\s*$/).required(),
    orgId: Joi.string().trim(),
    fromInvitation: Joi.boolean()
});

/**
 * Check if email id is present in database if called from login or signUp, skip check if called from send invitations
 * @method checkEmailPresent
 * @param {Object} input Used to get the input parameter (email)
 * @returns {Promise} Promise containing user details if email is found in database, containing true if called from
 * invitation and containing error message if email not found
 */
function checkEmailPresent(input) {
    return new Promise(function(resolve, reject) {
        // skip email check if called by send invitations
        if (!input.fromInvitation) {
            var find = { where: { email: input.email } };
            if (input.orgId) {
                find.include = [{ model: Organization, where: {orgId: input.orgId} }] 
            }
            // find if email exists in database
            User.findOne(find)
                .then(function(findResult) {
                    // return error message if email id not found
                    if (lodash.isEmpty(findResult)) {
                        reject(outputFormatter.format(false, 1100, null, 'User with email address ' + input.email));
                    } else {
                        resolve(findResult);
                    }
                }).catch(function(err) {
                    reject({ id: 400, msg: err });
                });
        } else {
            // if called by send invitations continue without checking
            resolve(true);
        }
    });
}

/**
 * If JWT token is found in the header, verifies and decodes it, else returns null
 * @method verifyTokenAndDecode
 * @param args To fetch the header, may not always be present
 * @returns {Promise} Promise containing the decoded token or null
 */
function verifyTokenAndDecode(args) {
    return new Promise(function(resolve) {
        // Check if token is present in the header
        if (args && args.header && args.header.authorization) {
            utils.verifyTokenAndDecode(args.header.authorization)
                .then(function(decoded) {
                    resolve(decoded);
                })
                .catch(function(err) {
                    resolve(null);
                });
        } else {
            // if token is missing, return null
            resolve(null);
        }
    });
};

/**
 * Create token for reset password URL and save details in database
 * @method createTokenAndSaveDetails
 * @param {Object} args Used to get the input parameter (email)
 * @param {String} orgId
 * @param {Object} invitedUserDetails
 * @returns {Promise} Promise containing the created token and fetched user document if successful, else containing
 * the error message
 */
function createTokenAndSaveDetails(args, orgId, invitedUserDetails) {
    return new Promise(function(resolve, reject) {
        var key = process.env.JWT_SECRET_KEY; // get JWT secret key to create JWT token
        var timestamp = (microtime.now() + 3600000000 * 48); // add expiry time to current timestamp to get expiry timestamp
        var data = { emailId: args.body.email, orgId: orgId }; // data to be stored in JWT token
        if (invitedUserDetails) { // if user details found, copy the user details into token data
            data.firstName = invitedUserDetails.firstName;
            data.lastName = invitedUserDetails.lastName;
        }
        var option = { expiresIn: expireTime }; // set expiry time of JWT token
        var token = jwt.sign(data, key, option); // create JWT token

        // TODO: Replace with model instance static method
        // add the expiry timestamp and token to user document and return the updated document
        Token.upsert({ tokenValidTillTimestamp: timestamp, token: token }, { where: { email: args.body.email } })
            .then(function (upsertResult) {
                resolve({token: token, userDetails: upsertResult});
            })
            .catch(function (err) {
                reject({ id: 400, msg: err});
            })
    });
}

/**
 * Send email to user with reset password link and token by using the Email API in common microservice
 * @method sendEmailToUser
 * @param {Object} args Used to get the input parameter (emailId)
 * @param {String} url Contains the reset URL to be sent in email
 * @param {Object} userDetails The user details fetched from database, used to get the user name for the email
 * @param {Object} header The request headers to forward to send email
 * @param {Seneca} seneca The seneca instance, used to call other microservice
 * @returns {Promise} Promise containing true
 */
function sendEmailToUser(args, url, userDetails, header, seneca) {
    return new Promise(function(resolve) {
        // if request is not from sendInvitations, send mail to user
        if (!args.body.fromInvitation) {
            // create JWT token for microservice call
            // default subject and content for formatter input
            var subject = "ResetPasswordSubject";
            var content = "ResetPasswordMessage";
            // create input for the email
            var body = {
                subject: outputFormatter.email(subject)
            };
            // add array of emails and email content to the input
            body.emailId = [args.body.email];
            body.content = outputFormatter.email(content, userDetails.firstName, url, expireTime);
            utils.microServiceCall(seneca, 'email', 'sendEmail', body, header, null);
        }
        resolve(true);
    });
}

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {Object} result The final result to be returned, contains the token created
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2240, result, 'Reset password link has been', 'on your email address. Please check your email, to reset account password.')
        });
    }
}

/**
 * It checks if input email is registered. If it is, it sends an email to the user with an URL to reset the password.
 * The URL has a token which is valid for sometime depending on the environment variable RESET_PASS_EXPIRE_TIME.
 * @param {Object} options Variables needed for database connection and microservices related details
 */

module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function(args, done) {
        
        // load models
        User = User || dbConnection.models.users;
        Token = Token || dbConnection.models.tokens;
        Organization = Organization || dbConnection.models.organizations;
        
        var resetURL = null;    // stores the reset URL depending on the incoming request URL
        var token = null;   // stores the reset token created
        var orgId = null;   // stores the organization fetched using the sub-domain
        var userDetails = null; // stores the user details fetched
        
        utils.checkInputParameters(args.body, forgotPasswordSchema)
            .then(function() {
                // set the reset password URL
                resetURL = args.header ? args.header.origin || 'https://' + process.env.APP_URL : 'https://' + process.env.APP_URL;
                resetURL = resetURL + '/#/reset-password?token=';
                return utils.fetchOrganizationId(args.body.orgId, args.header, seneca); // fetch user
                // organization
            })
            .then(function (response) {
                console.log("Response of fetchOrg --- ", response);
                orgId = response ? (args.body.orgId || response.orgId) : args.body.orgId;
                if (orgId) {
                    args.body.orgId = orgId;
                }
                return checkEmailPresent(args.body);
            })
            .then(function (response) {
                console.log("Response of checkEmail ---- ", response);
                userDetails = response;
                return verifyTokenAndDecode(args);
            })
            .then(function(response) {
                return createTokenAndSaveDetails(args, orgId, response);
            })
            .then(function(result) {
                resetURL = resetURL + result.token; // add created token to reset password URL
                token = result.token;
                return sendEmailToUser(args, resetURL, userDetails, args.header, seneca);
            })
            .then(function() {

                return sendResponse({ URL: resetURL, token: token }, done);
            })
            .catch(function(err) {
                console.log("Error in forgotPassword ----- ", err);
                seneca.log.error('[ ' + process.env.SRV_NAME + ': ' + __filename.split('/').slice(-1) + ' ]', "ERROR" +
                  " : ", err);
                done(null, {
                    statusCode: 200,
                    content: err.success === true || err.success === false ? err : utils.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};