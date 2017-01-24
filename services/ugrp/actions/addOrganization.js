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
    userId: Joi.string().required(),
    orgId: Joi.string().required()
});

/**
 * Update user details by adding organization Id to user's organization array
 * @method updateUser
 * @param {Object} input Used to get the input user details, user Id and organization Id
 * @returns {Promise} Promise containing the updated user details if successful, else containing the appropriate
 * error message
 */
function updateUser(input) {
    return new Promise(function(resolve, reject) {
        // Update the user document by adding the organization Id to array of organizations
        // addToSet makes sure there are no duplicates by not adding an existing organization Id
        User.update({ _id: input.userId }, { $addToSet: { orgIds: input.orgId } }, function(err, updateResponse) {
            if (err) {  // if there is an error in updating, return error
                reject({ id: 400, msg: err });
            } else {    // return the response of update query in case of no errors
                updateResponse = JSON.parse(JSON.stringify(updateResponse));
                resolve(updateResponse);
            }
        });
    });
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
    return function(args, done) {

        // load the mongoose model for Users
        User = User || mongoose.model('Users');
        
        // validate input parameters as per Joi schema
        utils.checkInputParameters(args.body, userSchema)
            .then(function() {
                // verify and decode JWT token
                return utils.verifyTokenAndDecode(args);
            })
            .then(function() {
                // update the user document by adding the organization Id
                return updateUser(args.body);
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