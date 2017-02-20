'use strict';

var utils = require(__base + '/sharedlib/utils');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var mongoose = require('mongoose');
var Promise = require('bluebird');
var microtime = require('microtime');
var User = null;

/**
 * @module addOrganization
 */

//Joi validation Schema
var userSchema = Joi.object().keys({
    userId: Joi.number().required(),
    orgId: Joi.number().required()
});

/**
 * Update user details by adding organization Id to user's organization array
 * @method updateUser
 * @param {Object} input Used to get the input user details, user Id and organization Id
 * @returns {Promise} Promise containing the updated user details if successful, else containing the appropriate
 * error message
 */
function updateUser(input) {

    // Update the user document by adding the organization Id to array of organizations
    return User.findOne({ where: { userId: input.userId } })
        .then(function(user) {
            if (lodash.isEmpty(user)) {
                return Promise.reject({ id: 400, msg: 'User Id not found.' });
            }
            return user.addOrganization(input.orgId);
        })
        .then(function(updateResponse) {
            console.log("Update response ---- ", updateResponse);
            // if no user is deleted, user id was not found or user does not belong to requester's organization
            if (updateResponse != 1) {
                return Promise.reject({ id: 400, msg: 'Adding user to the organization failed.' });
            } else {
                // TODO: Add to general group when using groups
                return true;
            }
        })
}

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {Object} result The updated user details to return
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2050, result, 'User')
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
 * This action has no API end point, called by actions in other microservices
 * It adds the organization Id provided in the user's array of organization Ids.
 * @param {Object} options Contains the seneca instance
 */

module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function(args, done) {

        console.log("Add Organization called ------- ", args.body);

        // load the ontology model for Users
        User = User || dbConnection.models.users;

        // validate input parameters as per Joi schema
        utils.checkInputParameters(args.body, userSchema)
            .then(function() {
                // verify and decode JWT token
                return utils.verifyTokenAndDecode(args.header.authorization);
            })
            .then(function() {
                // update the user document by adding the organization Id
                return updateUser(args.body);
            })
            .then(function(response) {
                sendResponse(response, done);
            })
            .catch(function(err) {
                console.log("Error in add organization --- ", err);
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