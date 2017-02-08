'use strict';

var utils = require(__base + '/sharedlib/utils');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var Organization = null;

/**
 * @module createOrganization
 */

//Joi validation Schema
//TODO: MOVE
var schema = Joi.object().keys({
    name: Joi.string().required(),
    website: Joi.string().regex(/^(http\:\/\/|https\:\/\/)?([a-zA-Z0-9][a-z0-9\-]*\.)+[a-zA-Z0-9][a-zA-Z0-9\-]*/),
    description: Joi.string(),
    subDomain: Joi.string().required()
});

/**
 * Check if user is authorized to create an organization
 * @method checkIfAuthorized
 * @param {String} decodedToken The decoded JWT token from the header
 * @returns {Promise} Resolved Promise if successful, else containing the error message
 */
function checkIfAuthorized(decodedToken) {
    return new Promise(function(resolve, reject) {
        if (decodedToken && decodedToken.isOwner) {    // if the decoded token belongs to an owner, resolve the
            // decoded token
            resolve();
        } else {    // else return unauthorized message
            reject({ id: 400, msg: "You are not authorized to create an organization." });
        }
    });
}

/**
 * Save Organization details in database
 * @method createOrganization
 * @param {Object} input Used to input parameters
 * @param {String} ownerId Used to Id of user
 * @returns {Promise} Promise containing created Organization document if successful, else containing
 * the error message
 */
function createOrganization(ownerId, input) {
    return new Promise(function(resolve, reject) {
        // create the organization object to be saved with owner Id and organization fqdn
        var data = {
            ownerId: ownerId,
            fqdn: input.subDomain + '.' + process.env.DOMAIN    // join the subdomain and domain to create the fqdn
        };

        // add the input data to the organization data to be saved
        data = lodash.assign(data, input);

        // save the new organization
        Organization.create(data)
            .then(function (saveResponse) {
                if (lodash.isEmpty(saveResponse)) {  // if error or empty, reject with the error message
                    reject({ id: 400, msg: "Failed. Organization not created." });
                }
                resolve(saveResponse);
            })
            .catch(function (err) {  // if error, check if error code represents duplicate index on unique field (fqdn)
                // reject with waterline error message
                reject({ id: 400, msg: err.message || err });
            });
    });
}

/**
 * Create default group 'users' by calling createGroup microservice
 * @method createDefaultGroup
 * @param {Object} header The header containing the JWT token with isMicroservice and isOwner flags set to true and
 * orgId
 * @param {Seneca} seneca The seneca instance used to make microservice call
 */
function createDefaultGroup(header, seneca) {
    // make seneca call to create group named 'users'
    utils.microServiceCall(seneca, 'ugrp', 'createGroup', { name: 'users' }, header, null);
}

/**
 * Add organization to the user's array of organizations created
 * @method addToUserOrg
 * @param {String} orgId The organization Id of the newly created organization
 * @param {String} userId The user Id of the owner of the organization
 * @param {Object} header The header containing the JWT token with isMicroservice and isOwner flags set to true and
 * orgId
 * @param {Seneca} seneca The seneca instance used to make microservice call
 */
function addToUserOrg(orgId, userId, header, seneca) {
    // make seneca call to add organization to user's array of organization Ids
    utils.microServiceCall(seneca, 'ugrp', 'addOrganization', { userId: userId, orgId: orgId }, header, null);
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
            content: outputFormatter.format(true, 2030, result, 'Organization')
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
 * This is a POST action for the Organizations microservice
 * It creates a new organization from the input details with the user as it's owner. A default 'users' group is
 * created in the organization and the organization added to the owner's list of organizations.
 * @param {Object} options Contains the seneca instance
 */

module.exports = function(options) {
    var seneca = options.seneca;
    var ontology = options.wInstance;
    return function(args, done) {
        
        // load the mongoose model for Organization
        Organization = Organization || ontology.collections.organizations;
        
        // if organization name is present in the input, convert it to lowercase (string fields to be sorted stored in 
        // lowercase)
        if (args.body.name) {
            args.body.name = args.body.name.toLowerCase();
        }
        
        // validate input against Joi schema
        utils.checkInputParameters(args.body, schema)
            .then(function() {
                // verify and decode input token and check if owner
                return checkIfAuthorized(args.credentials);
            })
            .then(function() {
                // create new organization from input values
                return createOrganization(args.credentials.userId, args.body);
            })
            .then(function(response) {
                
                // data to be stored in JWT token for microservice call
                var data = {
                    isMicroservice: true,   // to perform actions unavailable to user
                    orgId: response.orgId,  // newly created organization Id
                    isOwner: true
                };
                var header = utils.createMsJWT(data); // create JWT token using above data
                // create default group in the organization

                // TODO: Uncomment after using groups
                // createDefaultGroup(header, seneca);
                
                // add created organization to user's list of organizations
                addToUserOrg(response.orgId, response.ownerId, header, seneca);
                return sendResponse(response, done);
            })
            .catch(function(err) {
                // in case of error, print the error and send as response
                utils.senecaLog(seneca, 'error', __filename.split('/').pop(), err);

                // if the error message is formatted, send it as reply, else format it and then send
                done(null, {
                    statusCode: 200,
                    content: err.success === true || err.success === false ? err : utils.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};