'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
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
        Organization.update({ 'isDeleted': true }, { where: { orgId: orgId, ownerId: ownerId, isDeleted: false }, returning: true, plain: true })
            .then(function (updateResponse) {
                if (lodash.isEmpty(updateResponse[1])) {  // if error or empty, reject with the error message
                    reject({ id: 400, msg: "Invalid organization Id or not authorized to delete organization." });
                } else {
                    resolve();
                }
            })
            .catch(function (err) {
                reject({ id: 400, msg: "Invalid organization Id or not authorized to delete organization." });
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
            content: outputFormatter.format(true, 2060, null, 'Organization')
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
    var dbConnection = options.dbConnection;
    return function(args, done) {
        
        // load the mongoose model for organization
        Organization = Organization || dbConnection.models.organizations;

        // validate input against Joi schema
        utils.checkInputParameters(args.body, OrganizationSchema)
            .then(function() {
                // check if owner
                return utils.checkIfAuthorized(args.credentials);
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
                    content: 'success' in err ? err : utils.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};