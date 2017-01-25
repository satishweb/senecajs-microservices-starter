'use strict';

var utils = require(__base + '/sharedlib/utils');
var groupsLib = require(__base + '/lib/groups');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var mongoose = require('mongoose');
var Promise = require('bluebird');
var microtime = require('microtime');
var User = null;
var Group = null;

//Joi validation Schema
var userSchema = Joi.object().keys({
    userId: Joi.string().required()
});

/**
 * Soft delete user by setting the isDeleted flag for the corresponding user Id
 * @method deleteUser
 * @param {Object} input Used to get the input user details
 * @returns {Promise} Promise containing the updated user details if successful, else containing the appropriate
 * error message
 */
function deleteUser(input) {
    return new Promise(function(resolve, reject) {
        // update the user document to set isDeleted true
        User.findOneAndUpdate({ _id: input.userId }, { $set: { isDeleted: true } }, { new: true }, function(err, updateResponse) {
            if (err) {  // if error in updating, return with error message
                reject({ id: 400, msg: err.message});
            } else {    // if no error in updating, remove user from all groups and return with updated user document
                updateResponse = JSON.parse(JSON.stringify(updateResponse));
                removeFromGroups(input.userId); // remove Id of user from all groups, does not wait for response
                resolve(updateResponse);
            }
        });
    });
}

/**
 * Removes the Id of the deleted user from all groups in the organization. Does not affect rest of the action. If it
 * fails, the rest of the action continues.
 * @method removeFromGroups
 * @param {String} userId The Id of the deleted user
 */
function removeFromGroups(userId) {
    // Update group documents by removing deleted user Id from all groups
    Group.update({ userIds: { $in: [userId] } }, { $pull: { userIds: { $in: [userId] } } }, { multi: true },
        function(err, updateResponse) {
        if (err) {  // if error in update query, print it
            console.log("Error in deleting user Id from organization groups: ", err);
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
 * This is a DELETE action for the UGRP microservice
 * It soft deletes the user with input Id from the collection. It also deletes the Id of the user from all the groups
 * documents that he is a part of.
 * @param {Object} options Contains the seneca instance
 */

module.exports = function(options) {
    var seneca = options.seneca;
    return function(args, done) {
        
        // load the mongoose model for Users and Groups
        User = User || mongoose.model('Users');
        Group = Group || mongoose.model('Groups');

        // validate the input according to Joi schema
        utils.checkInputParameters(args.body, userSchema)
            .then(function() {
                // verify and decode the input token and check if owner of organization
                return groupsLib.verifyTokenAndDecode(args);
            })
            .then(function(decoded) {
                
                // create temporary models to point to organization related collections
                User = mongoose.model('DynamicUser', User.schema, decoded.orgId + '_users');
                Group = mongoose.model('DynamicGroup', Group.schema, decoded.orgId + '_groups');
                // soft delete the user by updating user document
                return deleteUser(args.body);
            })
            .then(function(response) {
                
                // delete the temporary models
                delete mongoose.connection.models['DynamicUser'];
                delete mongoose.connection.models['DynamicGroup'];
                sendResponse(response, done);
            })
            .catch(function(err) {
                console.log('err in add organization------- ', err);
                
                // delete the temporary models
                delete mongoose.connection.models['DynamicUser'];
                delete mongoose.connection.models['DynamicGroup'];
                
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