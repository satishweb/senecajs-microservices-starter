'use strict';


var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var Promise = require('bluebird');
var microtime = require('microtime');
var User = null;
var Organization = null;

/**
 * @module updateUser
 */

//Joi validation Schema
// TODO: All joi validations schema should inside joiSchemaValidations.js
var userSchema = Joi.object().keys({
    userId: Joi.number().required(),
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
function updateUser(input, decodedToken) {
    return new Promise(function(resolve, reject) {
        var userInstance = null;

        // remove null or empty values from input
        input = lodash.omitBy(input, function(value) {
            return value === null || value === '' || value === {};
        });

        // create find query to find user by userId and return the updated row
        var find = { where: { userId: input.userId } };
        // remove userId from input
        delete input.userId;
        // if organization is known, check if to be updated user belongs to that organization       

        // update user using created find query and input details 
        User.findOne(find)
            .then(function(user) {
                if (lodash.isEmpty(user)) {
                    return new Promise(function(resolve, reject) { reject('User Id not found.') });
                } else {
                    userInstance = user;
                    return user.getOrganizations({ where: { orgId: input.orgId } });
                }
            })
            .then(function(org) {
                if (lodash.isEmpty(org)) {
                    return new Promise(function(resolve, reject) { reject('User does not belong to organization.') });
                } else {
                    return userInstance.update(input)
                }
            })
            .then(function(updateResponse) {
                if (lodash.isEmpty(updateResponse)) {
                    reject({ id: 400, msg: 'User Id not updated.' });
                } else {
                    // resolve the updated user
                    resolve(updateResponse.toJSON());
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
    var dbConnection = options.dbConnection;
    return function(args, done) {
        // load the database models
        User = User || dbConnection.models.users;
        Organization = Organization || dbConnection.models.organizations;

        utils.checkInputParameters(args.body, userSchema)
            .then(function() {
                return verifyTokenBelongsToUser(args.body.userId, args.credentials);
            })
            .then(function() {

                // if orgId is present in the token, add it to input
                if (args.credentials.orgId) {
                    args.body.orgId = args.credentials.orgId;
                }
                return updateUser(args.body, args.credentials);
            })
            .then(function(response) {
                // remove password from output
                delete response.password;
                return sendResponse(response, done);
            })
            .catch(function(err) {
                console.log("Error in updateUser ---- ", err);
                utils.senecaLog(seneca, 'error', __filename.split('/').pop(), err);
                var error = err || { id: 400, msg: "Unexpected error" };
                done(null, {
                    statusCode: 200,
                    content: 'success' in error ? error : utils.error(error.id, error.msg, microtime.now())
                });
            });
    };
};