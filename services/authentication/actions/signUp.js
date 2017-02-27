'use strict';

var signUp = require(__base + 'sharedlib/signUp');
var session = require(__base + 'sharedlib/session');
var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var microtime = require('microtime');
var User = null;
var Session = null;
var Email = null;
var flag = false; // contains whether it is a new user or existing user and whether user document is to be created
// or updated

/**
 * @module signUp
 */

//Joi validation Schema
var signUpSchema = Joi.object().keys({
    signUpType: Joi.string().trim().valid('email', 'google', 'linkedIn', 'facebook', 'microsoft').required(), // specify the
    email: Joi.string()
        .when('signUpType', {
            is: 'email',
            then: Joi.string()
                .regex(/^\s*[\w\-\+​_]+(\.[\w\-\+_​]+)*\@[\w\-\+​_]+\.[\w\-\+_​]+(\.[\w\-\+_]+)*\s*$/)
                .required()
        }), // email field is required only when type is email
    password: Joi.string().when('signUpType', { is: 'email', then: Joi.string().trim().required() }), // password
    // is required only when type is email
    socialId: Joi.string()
        .when('signUpType', { is: ['google', 'linkedIn', 'facebook', 'microsoft'], then: Joi.string().trim().required() }),
    // socialId is required when type is either facebook, google, linkedIn, microsoft 
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
    var dbConnection = options.dbConnection;

    return function(args, done) {

        console.log("Sign up called --- ", args.body);

        // Database models for user and session
        User = User || dbConnection.models.users;
        Session = Session || dbConnection.models.sessions;
        Email = Email || dbConnection.models.emails;

        flag = false; // used to determine if user is a new user or already registered user with other login type
        var finalResponse = null; // stores the user details to be sent in response

        utils.checkInputParameters(args.body, signUpSchema)
            .then(function() {
                if (args.body.email) { // if email is present, convert email to lowercase
                    args.body.email = args.body.email.toLowerCase();
                }
                // check if user with email already exists
                return signUp.checkIfAlreadyPresent(dbConnection, User, Email, args.body, flag, done);
            })
            .spread(function(response, Flag) {
                flag = Flag; // update the value of flag from the response
                return signUp.createSaveData(args.body, response); // select required user values from input and DB
                // to create/update user details
            })
            .then(function(response) {
                // create new user or update existing one from previous data
                return signUp.saveUserDetails(User, Email, response, flag);
            })
            .spread(function(response, Flag) {
                flag = Flag;
                response = response.toJSON();
                delete response.password;
                response.emails = lodash.keys(lodash.keyBy(response.emails, 'email'));
                response.isOwner = true; // only team owner's can sign up, so set isOwner to true in response
                response.teamId = null;
                var orgs = {};
                orgs[args.header.origin.split('://')[0] + '://' + process.env.APP_URL] = { teamId: null, isOwner: true };
                response.origin = orgs;
                // create a session token for the signed up user
                return utils.createJWT(response, args.header);
            })
            .then(function (response) {
                delete response.output.origin;
                finalResponse = response; // store the final response for further use
                finalResponse.sessionData.emailId = args.body.email;
                // create a session and delete any previous sessions of the user
                return session.createSession(Session, finalResponse.output.token, finalResponse.sessionData);
            })
            .then(function() {
                return sendResponse(finalResponse.output, done);
            })
            .catch(function(err) {
                console.log("Error in Sign Up ---- ", err);
                seneca.log.error('[ ' + process.env.SRV_NAME + ': ' + __filename.split('/').slice(-1) + ' ]', "ERROR" +
                    " : ", err);
                done(null, {
                    statusCode: 200,
                    content: utils.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};