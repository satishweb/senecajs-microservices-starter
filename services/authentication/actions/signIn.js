'use strict';

var signIn = require(__base + 'sharedlib/signIn');
var session = require(__base + 'sharedlib/session');
var lodash = require('lodash');
var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var url = require('url');
var User = null;
var Organization = null;
var Session = null;
var Email = null;
/**
 * @module signIn
 */

// create Joi schema
var signInSchema = Joi.object().keys({
    type: Joi.string().trim().valid('email', 'google', 'linkedIn', 'facebook', 'microsoft').required(),
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
        is: ['google', 'linkedIn', 'facebook', 'microsoft'],
        then: Joi.string().required()
    }), // required only if type is facebook, google, microsoft, linkedIn
    socialName: Joi.string().trim(),
    socialProfilePic: Joi.string().trim(),
    socialEmail: Joi.string().regex(/^\s*[\w\-\+_]+(\.[\w\-\+_]+)*\@[\w\-\+_]+\.[\w\-\+_]+(\.[\w\-\+_]+)*\s*$/),
    gender: Joi.string().trim(),
    birthDate: Joi.string().trim(),
    subDomain: Joi.string()
}).without('email', ['socialId', 'socialEmail', 'socialName', 'socialProfilePic']);
// if email is present, the other fields should not be present

/**
 * Check if organization is deployed and is not deleted
 * @method checkOrganizationStatus
 * @param {Object} orgDetails used to get organization details
 * @returns {Promise} Promise containing the organization details if successful, else containing the error message
 */
function checkOrganizationStatus(orgDetails) {
    return new Promise(function(resolve, reject) {
        // console.log("Org details in checkOrg ---- ", orgDetails);
        if (!lodash.isEmpty(orgDetails)) { //check if organization details are present
            if (orgDetails.isUpdated == true && orgDetails.isDeleted == false) {
                resolve(orgDetails);
            } else {
                if (orgDetails.isDeleted == true) {
                    reject({ id: 400, msg: 'This Organization is currently disabled. Please contact Organization Admin.' });
                } else {
                    reject({ id: 400, msg: 'This Organization is not deployed' });
                }
            }
        } else {
            reject({ id: 400, msg: 'Invalid Organization/Sub-Domain' });
        }
    })
}

/**
 * @method checkIfUserMemberInOrganization
 * @param {Object} orgDetails used to get organization details
 * @param {Object} userDetails used to get user details
 * @returns {Promise} Promise containing the true details if successful, else containing the error message
 */
function checkIfUserMemberInOrganization(orgDetails, userDetails) {
    return new Promise(function(resolve, reject) {
        checkOrganizationStatus(orgDetails)
            .then(function(response) {
                // console.log("------- ", userDetails, response, orgDetails.orgId);
                if (response.ownerId == userDetails.userId) { //check if userId is same as ownerId of organization
                    resolve([orgDetails, true]);
                } else {
                    userDetails.getOrganizations({ where: { orgId: orgDetails.orgId } })
                        .then(function(org) {
                            if (lodash.isEmpty(org)) {
                                // console.log("Org user not found ---- ");
                                reject({ id: 400, msg: 'User not member of organization' });
                            } else {
                                // console.log("Response of getOrgs for org ---- ", org[0].toJSON());
                                resolve([orgDetails, false]);
                            }
                        })
                        .catch(function(err) {
                            // console.log("Error in getOrgs ---- ", err);
                            reject(err);
                        })
                }
            }).catch(function(err) {
                reject(err);
            })
    })
}

/**
 * 
 */
function fetchOrganization(userId, header, seneca) {
    return new Promise(function(resolve, reject) {
        utils.fetchOrganizationId(null, header, seneca)
            .then(function(org) {
                var isOwner = false;
                // console.log("Org fetched ---- ", org);
                if (lodash.isEmpty(org)) { //check if result is empty
                    reject({ id: 400, msg: 'Invalid Organization/Sub-Domain' });
                } else if (org && org.orgId && org.isDeleted == false) { //check if
                    // organization is not deleted
                    if (org.ownerId == userId) { //check if userId is same as ownerId of organization
                        isOwner = true;
                    }
                    resolve([org, isOwner]);
                } else {
                    reject({ id: 400, msg: 'This Organization is currently disabled. Please contact Organization Admin.' });
                }
            })
    });
}

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
 * This is a POST action for the Authentication microservice
 * Used to Sign in user using email or social login
 * @param {Object} options - Variables needed for database connection and microservices related details
 */
module.exports = function(options) {
    options = options || {};
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function(args, done) {

        var finalResponse = null; // stores the final response to be returned
        var orgId = null; // stores the organization Id fetched by sub-domain
        var orgName = null; // stores the organization name
        var ownerId = null;
        var user = null;
        var isOwner = false; // flag for whether the user is owner of the organization
        var emails = null;

        // load database models
        User = User || dbConnection.models.users;
        Organization = Organization || dbConnection.models.organizations;
        Email = Email || dbConnection.models.emails;
        Session = Session || dbConnection.models.sessions;

        if (args.body.email) {
            args.body.email = args.body.email.toLowerCase();
        }
        if (args.body.subDomain) { // if sub-domain is present
            args.header.origin = args.header.origin.split('://')[0] + '://' + args.body.subDomain + '.' + process.env.DOMAIN; //manipulate the
            // header origin to sub-domain passed
            // args.header.host = args.body.subDomain +'.'+ process.env.DOMAIN;
        }

        utils.checkInputParameters(args.body, signInSchema)
            .then(function() {
                return signIn.findUser(User, Email, args.body, args.header, seneca);
            })
            .then(function(userInstance) {
                return signIn.comparePasswords(args.body, userInstance);
            })
            .then(function(response) {
                // console.log("Response of login ---- ", response);
                user = response;
                emails = lodash.keys(lodash.keyBy(response.toJSON().emails, 'email'));
                var header = utils.createMsJWT({ isMicroservice: true });
                if (args.body.subDomain) {
                    return utils.microServiceCallPromise(seneca, 'organizations', 'checkStatus', { subDomain: args.body.subDomain }, header, true)
                } else {
                    return new Promise(function(resolve) {
                        resolve(true);
                    })
                }
            })
            .then(function(response) {
                // console.log("Response of checkStatus ---- ", response);
                if (response && response.content && response.content.data) {
                    orgId = response.content.data.orgId;
                }
                var appUrl = process.env.APP_URL;
                var port = args.header.origin.split(":");
                if (process.env.SYSENV == 'local') {
                    appUrl = process.env.APP_URL + ':' + port[port.length - 1];
                }
                // console.log('App url:- ', appUrl != args.header.origin.split('://')[1], appUrl, args.header.origin.split('://')[1]);
                if (args.body.subDomain) {
                    return checkIfUserMemberInOrganization(response.content.data, user);
                } else if (appUrl != args.header.origin.split('://')[1]) {
                    return fetchOrganization(user.userId, args.header, seneca);
                } else {
                    return new Promise(function(resolve) {
                        resolve([true, false]);
                    })
                }
            })
            .spread(function(orgDetails, owner) {
                isOwner = owner;
                if (orgDetails && orgDetails.orgId) {
                    orgId = orgDetails.orgId;
                }
                // console.log("Response of checkMember/fetchOrg ---- ", orgDetails);
                return signIn.updateLoginTime(User, user);
            })
            .then(function(userDetails) {
                // console.log("userDetails ---- ", userDetails);
                userDetails.isOwner = isOwner;
                userDetails.orgId = orgId;
                return utils.createJWT(userDetails, args.header);
            })
            .then(function(response) {
                finalResponse = response.output;
                return session.createSession(Session, response.output.token, response.sessionData);
            })
            .then(function(response) {
                delete finalResponse.password;
                finalResponse.emails = emails;
                // console.log("Final response ---- ", finalResponse);
                sendResponse(finalResponse, done);
            })
            .catch(function(err) {
                console.log('----signIn error---- ', err);
                var error = err || { id: 400, msg: "Unexpected error" };
                done(null, { statusCode: 200, content: 'success' in error ? error : utils.error(error.id, error.msg, microtime.now()) });
            });
    };
};