'use strict';

var signIn = require(__base + 'sharedlib/signIn');
var session = require(__base + 'sharedlib/session');
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
    type            : Joi.string().trim().valid('email', 'google', 'linkedIn', 'facebook', 'microsoft').required(),
    email           : Joi.string().trim().when('type', {
        is  : 'email',
        then: Joi.string().regex(/^\s*[\w\-\+​_]+(\.[\w\-\+_​]+)*\@[\w\-\+​_]+\.[\w\-\+_​]+(\.[\w\-\+_]+)*\s*$/)
            .required()
    }), // required only if type is email
    password        : Joi.string().trim().when('type', {
        is  : 'email',
        then: Joi.string().required()
    }), // required only if type is email
    socialId        : Joi.string().trim().when('type', {
        is  : ['google', 'linkedIn', 'facebook', 'microsoft'],
        then: Joi.string().required()
    }), // required only if type is facebook, google, microsoft, linkedIn
    socialName      : Joi.string().trim(),
    socialProfilePic: Joi.string().trim(),
    socialEmail     : Joi.string().regex(/^\s*[\w\-\+_]+(\.[\w\-\+_]+)*\@[\w\-\+_]+\.[\w\-\+_]+(\.[\w\-\+_]+)*\s*$/),
    gender          : Joi.string().trim(),
    birthDate       : Joi.string().trim()
}).without('email', ['socialId', 'socialEmail', 'socialName', 'socialProfilePic']);
// if email is present, the other fields should not be present

/**
 * Formats the output response and returns the response.
 * @method sendResponse
 * @param {Object} result - The final result to return.
 * @param {Function} done - the done formats and sends the response.
 */
var sendResponse = function (result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content   : outputFormatter.format(true, 2010, result)
        });
    } else {
        done(null, {
            statusCode: 200,
            content   : outputFormatter.format(false, 102)
        });
    }
};

/**
 * This is a POST action for the Authentication microservice
 * Used to Sign in user using email or social login
 * @param {Object} options - Variables needed for database connection and microservices related details
 */
module.exports = function (options) {
    options = options || {};
    var seneca = options.seneca;
    var ontology = options.wInstance;
    return function (args, done) {

        var finalResponse = null;   // stores the final response to be returned
        var orgId = null;           // stores the organization Id fetched by sub-domain
        var orgName = null;         // stores the organization name
        var ownerId = null;
        isOwner = false;            // flag for whether the user is owner of the organization

        // load waterline models
        User = User || ontology.collections.users;
        Session = Session || ontology.collections.sessions;

        // if input contains email id, convert it to lowercase
        if (args.body.email) {
            args.body.email = args.body.email.toLowerCase();
        }
        utils.checkInputParameters(args.body, signInSchema)
            .then(function () {
                return utils.fetchOrganisationId(null, args.header, seneca);
            })
            .then(function (response) {
                // console.log("Organization ----", response);
                // if organization is returned, store the organization Id and name and switch the mongoose model to
                // point to the organization users collection
                if (!lodash.isNull(response)) {
                    orgId = response.orgId;
                    orgName = response.name;
                    if (!lodash.isNull(orgId)) {
                        args.body.orgId = orgId;
                    }
                }
                ownerId = response ? response.ownerId : null;   // if organization is fetched, set the

                // organization owner Id
                return signIn.loginUser(User, args.body, ownerId, args.header, seneca);
            })
            .then(function (userDetails) {
                // if login was successful, update the last logged in time for user to current time
                return signIn.updateLoginTime(User, userDetails);
            })
            .then(function (userDetails) {
          
                // if organization Id is not set, user is main user, so set isOwner to true
                if (ownerId == userDetails.userId || lodash.isNull(orgId)) {
                    isOwner = true;
                }
                // set the organization related fields in the response
                userDetails.isOwner = isOwner;
                userDetails.orgId = orgId;

                // create JWT session token for the user
                return utils.createJWT(userDetails, args.header);
            })
            .then(function (response) {
                // store the final response to be returned
                finalResponse = response.output;

                // create a session in database using token and user details
                return session.createSession(Session, response.output.token, response.sessionData);
            })
            .then(function () {
                finalResponse.orgName = orgName;    // add the organization name to the response
                sendResponse(finalResponse, done);
            })
            .catch(function (err) {
                console.log("Error in signIn ---- ", err);
                // TODO: Implement this log for all messages
                utils.senecaLog(seneca, 'error', __filename.split('/').pop(), err);
                var error = err || {id: 400, msg: "Unexpected error"};
                done(null, {
                    statusCode: 200,
                    content: 'success' in error ? error : utils.error(error.id, error.msg, microtime.now())
                });
            });
    };
};