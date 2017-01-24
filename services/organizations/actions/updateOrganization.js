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
 * @module updateOrganization
 */

//Joi validation Schema
//TODO: MOVE
var OrganizationSchema = Joi.object().keys({
    orgId: Joi.string().required(),
    name: Joi.string(),
    subDomain: Joi.string(),
    description: Joi.string().allow(''),
    ownerId: Joi.string(),
    website: Joi.string().regex(/^$|^(http\:\/\/|https\:\/\/)?([a-zA-Z0-9][a-z0-9\-]*\.)+[a-zA-Z0-9][a-zA-Z0-9\-]*/).allow('')
});

/**
 * Verify and decode token and return the decoded token if it belongs to owner, else return error
 * @method verifyTokenAndDecode
 * @param {Object} args Used to access the JWT in the header
 * @returns {Promise} Promise containing decoded token if successful and belonging to owner, else containing the error
 * message
 */
function verifyTokenAndDecode(args) {
    return new Promise(function(resolve, reject) {
        // verify and decode JWT token and check if it belongs to an organization owner
        jwt.verify(args.header.authorization, process.env.JWT_SECRET_KEY, function(err, decoded) {
            if (err) {  // if error, reject with error message
                reject({ id: 404, msg: err });
            } else if (decoded && decoded.isOwner) {    // if decoded token belongs to owner, resolve decoded token
                resolve(decoded);
            } else {    // if token doesn't belong to owner, reject with unauthorized error message
                reject({ id: 400, msg: "You are not authorized to update an organization." });
            }
        });
    });
}


/**
 * Update Organization details
 * @method updateOrganization
 * @param {Object} input Input parameters
 * @returns {Promise} Promise containing the created Organization details if successful, else containing the appropriate
 * error message
 */
function updateOrganization(input, userId) {
    return new Promise(function(resolve, reject) {

        // remove null and empty objects from input and store in separate variable
        var updateData = lodash.omitBy(input, function(value) {
            return value === null || value === {};
        });
        // remove organization Id from update object
        delete updateData.orgId;

        // if sub-domain is being updated, change the fqdn accordingly
        if (input.subDomain) {
            // form the new fqdn by joining the sub domain and the domain
            updateData.fqdn = input.subDomain + process.env.DOMAIN;
        }

        // update the organization details, find organization to update by Id and check if the requesting user is
        // the owner of the organization and update with input details
        Organization.findOneAndUpdate({ _id: input.orgId, ownerId: userId}, updateData, { new: true }, function(err, updateResponse) {
            if (err) {// if error, check if error code represents duplicate index on unique field (fqdn)
                if (err.code === 11000) { // if error code is 11000, it means the fqdn already exists
                    reject({ id: 400, msg: "Sub Domain already exists." });
                } else {    // for any other error, return the error message
                    reject({ id: 400, msg: err.message || err });
                }
            } else {    // if no error, check if organization is returned
                if (lodash.isEmpty(updateResponse)) {   // if no organization is returned, return error
                    reject({ id: 400, msg: 'Invalid Organization Id or not owner of the organization.' });
                } else { // if organization is returned, transform the object and return it
                    updateResponse = JSON.parse(JSON.stringify(updateResponse));    // force mongoose transform
                    resolve(updateResponse);
                }
            }
        });
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
            content: outputFormatter.format(true, 2050, result, 'Organization')
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
 * This is a PUT action for the Organizations microservice
 * It checks if the requester is the owner of the organization and then updates the organization specified by the
 * organization Id with the input.
 * @param {Object} options Contains the seneca instance
 */

module.exports = function(options) {
    var seneca = options.seneca;
    return function(args, done) {

        // load the mongoose model for Organizations
        Organization = Organization || mongoose.model('Organizations');

        // if input contains field name, convert it to lowercase
        if (args.body.name) {
            args.body.name = args.body.name.toLowerCase();
        }

        // validate input against Joi schema
        utils.checkInputParameters(args.body, OrganizationSchema)
            .then(function() {
                // verify and decode input token and check if owner
                return verifyTokenAndDecode(args);
            })
            .then(function(decodedToken) {
                // update organization by Id if it belongs to user
                return updateOrganization(args.body, decodedToken.userId);
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