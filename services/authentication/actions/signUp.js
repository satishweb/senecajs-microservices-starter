'use strict';

var signUp = require(__base + 'sharedlib/signUp');
var session = require(__base + 'sharedlib/session');
var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__dirname + '/../');
var Joi = require('joi');
var mongoose = require('mongoose');
var microtime = require('microtime');
var User = null;
var Session = null;
var flag = false; // contains whether it is a new user or existing user and whether user document is to be created
// or updated

/**
 * @module signUp
 */

//Joi validation Schema
var signUpSchema = Joi.object().keys({
    signUpType: Joi.string().trim().valid('email', 'google', 'linkedIn', 'facebook').required(), // specify the
    // allowed type values
    accountType: Joi.string().trim().valid('employee', 'company').required(), // specify the allowed account values
    email: Joi.string()
        .when('signUpType', {
            is: 'email',
            then: Joi.string()
                .regex(/^\s*[\w\-\+​_]+(\.[\w\-\+_​]+)*\@[\w\-\+​_]+\.[\w\-\+_​]+(\.[\w\-\+_]+)*\s*$/)
                .required()
        }), // email field is required only when type is email
    name: Joi.string().when('signUpType', { is: 'email', then: Joi.string().trim().required() }), // password
    // is required only when type is email
    socialId: Joi.string()
        .when('signUpType', { is: ['google', 'linkedIn', 'facebook'], then: Joi.string().trim().required() }),
    // socialId is required when type is either facebook or google 
    socialName: Joi.string().trim(),
    socialEmail: Joi.string().regex(/^\s*[\w\-\+​_]+(\.[\w\-\+_​]+)*\@[\w\-\+​_]+\.[\w\-\+_​]+(\.[\w\-\+_]+)*\s*$/),
    socialProfilePic: Joi.string().trim()
}).without('email', ['socialId', 'socialEmail', 'socialName', 'socialProfilePic']); // email field should not be
// provided if the fields in the array are provided

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {Object} result The updated user details
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2140, result, 'User')
        });
    } else {
        //else return error
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
}

/**
 * It registers a new user
 */
module.exports = function(options) {
    var seneca = options.seneca;
    return function(args, done) {

        // Mongoose models for user and session
        User = User || mongoose.model('Users');
        Session = Session || mongoose.model('Sessions');

        flag = false;   // used to determine if user is a new user or already registered user with other login type
        var finalResponse = null;   // stores the user details to be sent in response

        utils.checkInputParameters(args.body, signUpSchema)
            .then(function() {
                if (args.body.email) { // if email is present, convert email to lowercase
                    args.body.email = args.body.email.toLowerCase();
                }
                // check if user with email already exists
                return signUp.checkIfAlreadyPresent(User, args.body, flag, done);
            })
            .spread(function(response, Flag) {
                flag = Flag;    // update the value of flag from the response
                return signUp.createSaveData(args.body, response);  // select required user values from input and DB
                // to create/update user details
            })
            .then(function(response) {
                // create new user or update existing one from previous data
                return signUp.saveUserDetails(User, response, flag);
            })
            .spread(function(response, Flag) {
                flag = Flag;
                response.isOwner = true;    // only organization owner's can sign up, so set isOwner to true in response
                response.orgId = null;
                // create a session token for the signed up user
                return utils.createJWT(response, args.header);
            })
            .then(function(response) {
                finalResponse = response;   // store the final response for further use
                // if user signed up using email, send confirmation mail with set password link
                if (args.body.email) {
                    return signUp.callForgotPassword(response.output, args.header, seneca);
                } else {    // else continue
                    return new Promise(function(resolve) {
                        resolve(response.output);
                    });
                }
            })
            .then(function() {
                // create a session and delete any previous sessions of the user
                return session.createSession(Session, finalResponse.output.token, finalResponse.sessionData);
            })
            .then(function() {
                return sendResponse(finalResponse.output, done);
            })
            .catch(function(err) {
                seneca.log.error('[ ' + process.env.SRV_NAME + ': ' + __filename.split('/').slice(-1) + ' ]', "ERROR" +
                  " : ", err);
                done(null, {
                    statusCode: 200,
                    content: utils.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};