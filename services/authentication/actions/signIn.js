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
    type            : Joi.string().trim().valid('email', 'google', 'linkedIn', 'facebook').required(),
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
        is  : ['google', 'linkedIn', 'facebook'],
        then: Joi.string().required()
    }), // required only if type is facebook or google
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
 * Get the organization by matching the request header's origin to organization sub-domain.
 * If request is from Postman, returns the sample organization from bootstrap.
 * If the fqdn doesn't match with any organization's, null is returned.
 * If the corresponding organization has been deleted, error message is returned.
 * @method fetchOrganisationId
 * @param {Object} header The input headers to get the request origin
 * @param {Seneca} seneca The Seneca instance to call microservice
 * @returns {Promise} Resolved promise containing the organization details if the request origin matches a non deleted
 * organization or null if no match is found or rejected promise containing the error message.
 */
function fetchOrganisationId(header, seneca) {
    return new Promise(function (resolve, reject) {
        
        // check if the request has come from Postman
        if ((process.env.SYSENV !== 'prod' && ((header.origin && header.origin.match('chrome-extension')) ||
            (header['user-agent'] && header['user-agent'].match('PostmanRuntime'))))) {
        
            // if request is from Postman, resolve with sample organization details
            resolve({name: 'Example', orgId: 1, ownerId: 1});
        } else {

            // if the request is not from Postman, separate the fqdn and fetch the matching organization
            header = url.parse(header.origin);
            header = header.host;
            var urlComp = header.split(':');    // remove the trailing port for localhost

            // find the organization corresponding to the sub-domain by calling getOrganization of organizations
            // microservice
            utils.microServiceCall(seneca, 'organizations', 'getOrganization', {action: 'fqdn', fqdn: urlComp[0]}, null,
                function (err, orgResult) {
                    if (err) {
                        resolve(err);
                    } else if (orgResult.content && lodash.isEmpty(orgResult.content.data)) { // if data
                        // returned is empty, organization was not found
                        resolve(null);
                    } else if (orgResult.content &&
                        orgResult.content.data &&
                        orgResult.content.data.isDeleted ==
                        false) {
                        // if organization details are returned, check if the organization has not been deleted and
                        // return the details
                        resolve(orgResult.content.data);
                    } else {    // if organization has been deleted, return error message
                        reject({
                            id: 400,
                            msg: 'This Organization is currently disabled. Please contact Organization Admin.'
                        });
                    }
                });
        }
    });
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
    return new Promise(function (resolve, reject) {

        // log in user depending on the sub domain
        signIn.loginUser(User, input, header, seneca)
            .then(function (response) {
                if (response.orgId == input.orgId){
                    resolve(response);
                } else if (!response.orgId && response.userId == ownerId ) {
                    resolve(response);
                } else {
                    reject(outputFormatter.format(false, 2270, null, 'email'));
                }
            })
            .catch(function (err) {
                    // if user is not found and was not searched in organization collection, return
                    // error
                    reject(err);
            })
    });
}

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
                return fetchOrganisationId(args.header, seneca);
            })
            .then(function (response) {

                // if organization is returned, store the organization Id and name and switch the mongoose model to
                // point to the organization users collection
                if (!lodash.isEmpty(response)) {
                    orgId = response.orgId;
                    orgName = response.name;
                    if (orgId) {
                        args.body.orgId = orgId;
                    }
                }
                var ownerId = response ? response.ownerId : null;   // if organization is fetched, set the
                // organization owner Id
                return signInCall(ownerId, args.body, args.header, seneca);
            })
            .then(function (userDetails) {
                // if login was successful, update the last logged in time for user to current time
                return signIn.updateLoginTime(User, userDetails);
            })
            .then(function (userDetails) {

                // if organization Id is not set, user is main user, so set isOwner to true
                if (!orgId) {
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
            .then(function (response) {
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