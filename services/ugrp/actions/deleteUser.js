'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
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
function deleteUser(input, userId) {
    return new Promise(function (resolve, reject) {
        
        // do not let user delete own profile
        if (input.userId == userId) {
            reject({id: 400, msg: 'User cannot delete himself/herself.'});
        }

        // update the user document to set isDeleted true
        // User.update({ isDeleted: true }, { where: { userId: input.userId, isDeleted: false } })
        User.findOne({ where: { userId: input.userId } })
            .then(function (user) {
                if (lodash.isEmpty(user)) {
                    reject({ id: 400, msg: 'User not found.' });
                }
                return user.removeTeam(input.teamId);
            })    
            .then(function (removeResponse) {
                console.log("Remove response ---- ", removeResponse);
                // if no user is deleted, user id was not found or user does not belong to requester's team
                if (lodash.isEmpty(removeResponse)) {
                    reject({ id: 400, msg: 'Deleting user from the team failed.' });
                } else {
                    // TODO: uncomment after using groups
                    // removeFromGroups(input.userId, input.teamId); // remove Id of user from all groups, does not wait for response
                    resolve(true);
                }
            })
            .catch(function(err) { // if error in updating, return with error message
                reject({ id: 400, msg: err.message });
            })
    });
}

/**
 * Removes the Id of the deleted user from all groups in the team. Does not affect rest of the action. If it
 * fails, the rest of the action continues.
 * @method removeFromGroups
 * @param {String} userId The Id of the deleted user
 * @param {String} teamId The Id of the team to which the user belongs
 */
function removeFromGroups(userId, teamId) {
    // Update group documents by removing deleted user Id from all groups
    Group.update({ userIds: [userId], teamId: teamId }, { $pull: { userIds: { $in: [userId] } } }, { multi: true },
        function(err, updateResponse) {
            if (err) { // if error in update query, print it
                console.log("Error in deleting user Id from team groups: ", err);
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
            content: outputFormatter.format(true, 2060, null, 'User')
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
    var dbConnection = options.dbConnection;
    return function(args, done) {

        // load the database models
        User = User || dbConnection.models.users;
        // Group = Group || mongoose.model('Groups');

        // validate the input according to Joi schema
        utils.checkInputParameters(args.body, userSchema)
            .then(function() {
                // verify and decode the input token and check if owner of team
                return groupsLib.verifyTokenAndDecode(args);
            })
            .then(function(decoded) {

                args.body.teamId = decoded.teamId;                
                // soft delete the user by updating user document
                return deleteUser(args.body);
            })
            .then(function(response) {
                sendResponse(response, done);
            })
            .catch(function(err) {
                console.log('err in delete user ------- ', err);

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