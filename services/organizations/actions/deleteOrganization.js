'use strict';

var utils = require(__base + '/sharedlib/utils');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var Promise = require('bluebird');
var microtime = require('microtime');
var Organization = null;

/**
 * @module deleteOrganization
 */

//Joi validation Schema
var OrganizationSchema = Joi.object().keys({
    orgId: Joi.string().required()
});

/**
 * Check if user is authorized to delete the organization
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
            reject({ id: 400, msg: "You are not authorized to delete the organization." });
        }
    });
}


/**
 * Soft delete the organization by updating isDeleted to true
 * @method deleteOrganization
 * @param {String} orgId Organization Id of the organization to delete
 ** @param {String} ownerId User Id of the user
 * @returns {Promise} Promise containing the response Organization details if successful, else containing the
 * appropriate error message
 */
function deleteOrganization(ownerId, orgId) {
    return new Promise(function(resolve, reject) {

        // update the organization to isDeleted true by the orgId and return the updated document
        Organization.update({ orgId: orgId, ownerId: ownerId, isDeleted: false }, { 'isDeleted': true })
            .then(function (updateResponse) {
                if (lodash.isEmpty(updateResponse)) {  // if error or empty, reject with the error message
                    reject({ id: 400, msg: "Invalid organization Id or not authorized to delete organization." });
                }
                resolve(updateResponse);
            })
            .catch(function (err) {
                reject({ id: 400, msg: err.message || "Invalid Organization Id"});
            })
    });
}


/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {Object} result The updated Organization details to return
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2060, result, 'Organization')
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
 * This is a DELETE action for the Organizations microservice
 * It soft deletes an organization by the organization Id.
 * @param {Object} options Contains the seneca instance
 */

module.exports = function(options) {
    var seneca = options.seneca;
    var ontology = options.wInstance;
    return function(args, done) {
        
        // load the mongoose model for organization
        Organization = Organization || ontology.collections.organizations;

        // validate input against Joi schema
        utils.checkInputParameters(args.body, OrganizationSchema)
            .then(function() {
                // check if owner
                return checkIfAuthorized(args.credentials);
            })
            .then(function() {
                // soft delete the organization
                return deleteOrganization(args.credentials.userId, args.body.orgId);
            })
            .then(function(response) {
                sendResponse(response, done);
            })
            .catch(function (err) {
                console.log("error in delete org ----- ", err);
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