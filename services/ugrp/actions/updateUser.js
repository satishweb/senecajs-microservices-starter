'use strict';


var utils = require(__base + '/sharedlib/utils');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var waterline = require('waterline');
var Promise = require('bluebird');
var jwt = require('jsonwebtoken');
var microtime = require('microtime');
var User = null;

/**
 * @module updateUser
 */

//Joi validation Schema
// TODO: All joi validations schema should inside joiSchemaValidations.js
var userSchema = Joi.object().keys({
    userId: Joi.string().trim().required(),
    email: Joi.string().regex(/^\s*[\w\-\+​_]+(\.[\w\-\+_​]+)*\@[\w\-\+​_]+\.[\w\-\+_​]+(\.[\w\-\+_]+)*\s*$/),
    firstName: Joi.string().allow('').trim(),
    lastName: Joi.string().allow('').trim(),
    status: Joi.string().trim().valid('offline', 'online', ''),
    avatar: Joi.string().allow('').trim(),
    contactNumber: Joi.string().allow('').trim(),
    companyName: Joi.string().allow('').trim(),
    address: Joi.string().allow('').trim(),
    gender: Joi.string().trim().valid('male', 'female', 'other'), // specify allowed values for gender
    birthDate: Joi.date().allow(''), // specify date format
    facebookId: Joi.string().allow('').trim(),
    googleId: Joi.string().allow('').trim(),
    linkedInId: Joi.string().allow('').trim()
});

/**
 * Checks if the decoded token belongs to the user whose profile is being updated. If the token doesn't belong to the same user or the owner of the organization, return error.
 * @method verifyTokenBelongsToUser
 * @param {String} userId UserId provided in the input, Id of the user whose profile is to be updated
 * @param {Object} decodedToken The token received in header after decoding
 * @returns {Promise} Promise containing decoded token if successful, else containing the error message
 */
function verifyTokenBelongsToUser(userId, decodedToken) {
    return new Promise(function(resolve, reject) {
        // check if the token belongs to the user, or if the token belongs to the owner of the user's organization and the token contains the Id of the organization
        if (userId == decodedToken.userId || (decodedToken.isOwner && decodedToken.orgId)) {
            resolve();
        } else {
            reject({ id: 400, msg: "You are not authorized to update this user's profile." });
        }
    });
}

/**
 * Update user details
 * @method updateUser
 * @param {Object} input The input parameters to be updated
 * @returns {Promise} Promise containing the updated user details if successful, else containing the appropriate
 * error message
 */
function updateUser(input) {
    return new Promise(function(resolve, reject) {
        input = lodash.omitBy(input, function(value) {
            return value === null || value === '' || value === {};
        });
        var find = { userId: input.userId };

        if (input.orgId) {
            find.orgId = input.orgId;
        }

        // removing the Amazon S3 Data URL from the uploaded file path and saving only the key in database.
        if (input.avatar) {
            input.avatar = response.getUploadedFileKey(input.avatar);
        }
        User.update(find, input)
            .then(function(findResult) {
                if (lodash.isEmpty(findResult)) {
                    reject({ id: 400, msg: 'User id not found in the organization.' });
                } else {
                    delete findResult[0].password;
                    resolve(findResult);
                }
            })
            .catch(function(err) {
                reject({ id: 400, msg: err });
            })
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
        if (result.avatar) {
            result.avatar = response.createUploadedFileURL(result.avatar);
        }
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2000, result, 'User details have been updated successfully.')
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
 * It updates the user details in the database. User Id is fetched from token, so user can edit only his own profile.
 */
module.exports = function(options) {
    var seneca = options.seneca;
    var ontology = options.wInstance;
    return function(args, done) {
        User = User || ontology.collections.users;
        utils.checkInputParameters(args.body, userSchema)
            .then(function() {
                return verifyTokenBelongsToUser(args.body.userId, args.credentials);
            })
            .then(function() {
                if (!lodash.isEmpty(args.credentials.orgId)) {
                    args.body.orgId = args.credentials.orgId;
                }
                return updateUser(args.body);
            })
            .then(function(response) {
                return sendResponse(response, done);
            })
            .catch(function(err) {
                console.log("Error in updateUser ------ ", err);
                // TODO: Implement this log for all messages
                utils.senecaLog(seneca, 'error', __filename.split('/').pop(), err);
                var error = err || { id: 400, msg: "Unexpected error" };
                done(null, {
                    statusCode: 200,
                    content: 'success' in error ? error : utils.error(error.id, error.msg, microtime.now())
                });
            });
    };
};