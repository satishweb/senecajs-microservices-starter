'use strict';

var utils = require(__base + '/sharedlib/utils');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var mongoose = require('mongoose');
var Promise = require('bluebird');
var jwt = require('jsonwebtoken');
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
 * Verify token and check if it belongs to an owner. If it does, return the decoded token else return error message
 * @method verifyTokenAndDecode
 * @param {String} token The JWT token from the header
 * @returns {Promise} Promise containing decoded token if successful, else containing the error message
 */
function verifyTokenAndDecode(token) {
    return new Promise(function(resolve, reject) {

        // verify and decode the JWT token
        jwt.verify(token, process.env.JWT_SECRET_KEY, function(err, decoded) {
            if (err) {  // if there is an error, reject with error message
                reject({ id: 404, msg: err });
            } else if (decoded && decoded.isOwner) {    // if the decoded token belongs to an owner, resolve the
                // decoded token
                resolve(decoded);
            } else {    // else return unauthorized message
                reject({ id: 400, msg: "You are not authorized to create an organization." });
            }
        });
    });
}


/**
 * Soft delete the organization by updating isDeleted to true
 * @method deleteOrganization
 * @param {String} orgId Organization Id of the organization to delete
 * @returns {Promise} Promise containing the response Organization details if successful, else containing the
 * appropriate error message
 */
function deleteOrganization(orgId) {
    return new Promise(function(resolve, reject) {

        // update the organization to isDeleted true by the orgId and return the updated document
        Organization.findOneAndUpdate({ _id: orgId }, { 'isDeleted': true }, { new: true }, function(err, updateResponse) {
            if (err || lodash.isEmpty(updateResponse)) {  // if error or empty, reject with the error message
                reject({ id: 400, msg: err.message || "Invalid Organization Id"});
            } else {    // resolve the returned updated organization document
                updateResponse = JSON.parse(JSON.stringify(updateResponse));
                resolve(updateResponse);
            }
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
    return function(args, done) {
        
        // load the mongoose model for organization
        Organization = Organization || mongoose.model('Organizations');

        // validate input against Joi schema
        utils.checkInputParameters(args.body, OrganizationSchema)
            .then(function() {
                // verify and decode input token and check if owner
                return verifyTokenAndDecode(args.header.authorization);
            })
            .then(function() {
                // soft delete the organization
                return deleteOrganization(args.body.orgId);
            })
            .then(function(response) {
                sendResponse(response, done);
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