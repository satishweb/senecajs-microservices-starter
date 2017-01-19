'use strict';

var signIn = require(__base + 'sharedlib/signIn');
var session = require(__base + 'sharedlib/session');
var authentication = require(__base + 'sharedlib/authentication');
var mongoose = require('mongoose');
var lodash = require('lodash');
var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__dirname + '/../');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var url = require('url');
var User = null;
var Session = null;
var isOwner = false;
/**
 * @module signIn
 */

// create Joi schema
var signInSchema = Joi.object().keys({
    type: Joi.string().trim().valid('email', 'google', 'linkedIn', 'facebook').required(),
    email: Joi.string().trim().when('type', {
        is: 'email',
        then: Joi.string().regex(/^\s*[\w\-\+​_]+(\.[\w\-\+_​]+)*\@[\w\-\+​_]+\.[\w\-\+_​]+(\.[\w\-\+_]+)*\s*$/)
            .required()
    }), // required only if type is email
    password: Joi.string().trim().when('type', {
        is: 'email',
        then: Joi.string().required()
    }), // required only if type is email
    socialId: Joi.string().trim().when('type', {
        is: ['google', 'linkedIn', 'facebook'],
        then: Joi.string().required()
    }), // required only if type is facebook or google
    socialName: Joi.string().trim(),
    socialProfilePic: Joi.string().trim(),
    socialEmail: Joi.string().regex(/^\s*[\w\-\+_]+(\.[\w\-\+_]+)*\@[\w\-\+_]+\.[\w\-\+_]+(\.[\w\-\+_]+)*\s*$/),
    gender: Joi.string().trim(),
    birthDate: Joi.string().trim()
}).without('email', ['socialId', 'socialEmail', 'socialName', 'socialProfilePic']);
// if email is present, the other fields should not be present

/**
 * Formats the output response and returns the response.
 * @method sendResponse
 * @param {Object} result - The final result to return.
 * @param {Function} done - the done formats and sends the response.
 */
var sendResponse = function(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2010, result)
        });
    } else {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
};

/**
 * Checks and logs in user if he's present in the organization collection related to the sub-domain. If user is not
 * found in the organization, finds user in main user collection. Successfully logs in user from main collection
 * only if user is owner of the organization.
 * @method signInCall
 * @param {String} ownerId - The Id of the organization owner in case of sub-domain login, else null.
 * @param {Object} input - The input containing the email and password.
 * @param {Object} header - The request header information needed by signUp in case of
 * @param {Seneca} seneca - The seneca instance
 * @returns {Promise} Promise containing user details if logged in successfully, else the error message
 */

function signInCall(ownerId, input, header, seneca) {
    return new Promise(function(resolve, reject) {
        // log in user depending on the sub domain
        signIn.loginUser(User, input, header, seneca)
          .then(function(response) {
              // if user is found and password matches, resolve the user details
            resolve(response)})
          .catch(function(err) {
              // if user login fails the first time, check if user was not found in collection (code: 2270) and
              // user was searched in the organization collection the first time
            if (err.success == false && err.message.id == 2270 && ownerId) {
                // if user was not found in organization collection, search in main user collection
                User = mongoose.model('Users'); // change the mongoose model to point to main user collection
                signIn.loginUser(User, input, header, seneca).then(function(response) {
                    // if user is found, check if user is the owner of the organization
                    // if owner, return the userDetails, else return error message
                    if (response.userId == ownerId) {
                        isOwner = true;
                        resolve(response);
                    } else {
                        reject(outputFormatter.format(false, 2270, null, 'email'));
                    }
                }).catch(function(err) {
                    // if error in signing in, return error
                    reject(err);
                })
            } else {
                reject(err);
            }
        })
    });
}

/**
 * This is a POST action for the Authentication microservice
 * Used to Sign in user using email or social login
 * @param {Object} options - Variables needed for database connection and microservices related details
 */
module.exports = function(options) {
    options = options || {};
    var seneca = options.seneca;
    return function(args, done) {
        
        var finalResponse = null;   // stores the final response to be returned
        var orgId = null;           // stores the organization Id fetched by sub-domain
        var orgName = null;         // stores the organization name
        isOwner = false;            // whether the user is owner of the organization

        // load mongoose models
        User = mongoose.model('Users');
        Session = Session || mongoose.model('Sessions');
        
        // if input contains email id, convert it to lowercase
        if (args.body.email) {
            args.body.email = args.body.email.toLowerCase();
        }
        utils.checkInputParameters(args.body, signInSchema)
            .then(function() {
                return fetchOrganisationId(args.header, seneca);
            })
            .then(function(response) {
                if (!lodash.isEmpty(response)) {
                    orgId = response.orgId;
                    orgName = response.name;
                    User = mongoose.model('DynamicUser', User.schema, response.orgId + '_users');
                }
                var ownerId = response ? response.ownerId : null;
                return signInCall(ownerId, args.body, args.header, seneca);
                // return signIn.loginUser(User, args.body, args.header, seneca);
            })
            .then(function(userDetails) {
                return signIn.updateLoginTime(User, userDetails);
            })
            .then(function(userDetails) {
                if (!orgId) {
                    isOwner = true;
                }
                userDetails.isOwner = isOwner;
                userDetails.orgId = orgId;
                return utils.createJWT(userDetails, args.header);
            })
            .then(function(response) {
                finalResponse = response.output;
                return session.createSession(Session, response.output.token, response.sessionData);
            })
            .then(function(response) {
                delete mongoose.connection.models['DynamicUser'];
                finalResponse.orgName = orgName;
                console.log("Final response ---- ", finalResponse);
                sendResponse(finalResponse, done);
            })
            .catch(function(err) {
                delete mongoose.connection.models['DynamicUser'];
                // TODO: Implement this log for all messages
                utils.senecaLog(seneca, 'error', __filename.split('/').slice(-1).join(''), err);
                var error = err || { id: 400, msg: "Unexpected error" };
                done(null, { statusCode: 200, content: 'success' in error ? error : utils.error(error.id, error.msg, microtime.now()) });
            });
    };
};