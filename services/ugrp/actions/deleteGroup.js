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
var Group = null;
var User = null;

/**
 * @module deleteGroup
 */

//Joi validation Schema
var GroupSchema = Joi.object().keys({
    groupId: Joi.string().required()
});

/**
 * Verify token and return the decoded token if it belongs to organization owner
 * @method verifyTokenAndDecode
 * @param {Object} args Used to access the JWT in the header
 * @returns {Promise} Promise containing decoded token if successful, else containing the error message
 */
/*function verifyTokenAndDecode(args) {
    return new Promise(function(resolve, reject) {
        // verify and decode token
        jwt.verify(args.header.authorization, process.env.JWT_SECRET_KEY, function(err, decoded) {
            if (err) {
                reject({ id: 404, msg: err });
            } else if (decoded && decoded.orgId && decoded.isOwner) { // check if token contains organization Id and
                // belongs to an organization owner
                resolve(decoded);
            } else {
                reject({ id: 400, msg: "You are not authorized to delete a Group." });
            }
        });
    });
}*/


/**
 * Delete Group
 * @method deleteGroup
 * @param {String} groupId Id of the group to be deleted
 * @returns {Promise} Empty Promise if group is successfully deleted, else containing the appropriate error message
 */

function deleteGroup(groupId) {
    return new Promise(function(resolve, reject) {
        Group.remove({_id: groupId}, function(err, response) {
            if (err || response.n === 0) {   // Check for error or if group has been removed
                reject({ id: 400, msg: err.message || 'Error removing group.'});
            } else {    // else continue
                resolve();
            }
        })
    });
}


/**
 * Fetch Group details from group Id and check if group being deleted is default 'users' group and if user is the
 * owner of the group. Return error messages for 'users' group being deleted and non owner deleting a group
 * @method fetchGroup
 * @param {String} groupId Id of the group to be deleted
 * @param {String} userId User Id fetched from token to check if group belongs to user
 * @returns {Promise} Promise containing the created Group details if successful, else containing the appropriate
 * error message
 */
function fetchGroup(groupId, userId) {
    return new Promise(function(resolve, reject) {

        // fetch group details by group Id
        Group.findOne({ _id: groupId }, function(err, findResponse) {
            if (err) {  // if error, reject Promise with error message
                reject({ id: 400, msg: err.message});
            } else {    // else check for empty response, whether default group is being deleted or deleted by owner
                // or not
                if (lodash.isEmpty(findResponse)) { // check for empty response, meaning group Id is incorrect
                    reject({ id: 400, msg: "Invalid Group Id" });
                } else if (findResponse.name == 'users') {  // check if group being deleted is the default group
                    // which can't be deleted
                    reject({ id: 400, msg: "Cannot delete users Group" });
                } else if (findResponse.ownerId != userId) {   // check if user is the owner of the group
                    reject({ id: 400, msg: "Only owner of the group can delete the group." });
                } else {    // if all conditions are met, return the fetched group
                    findResponse = JSON.parse(JSON.stringify(findResponse));    // force mongoose tranform to
                    // convert keys
                    resolve(findResponse);
                }
            }
        })
    });
}

/**
 * Remove the group Id from all user documents. Does not wait for completion of this operation. Action continues
 * even if this operation fails.
 * @method removeGroupId
 * @param {String} groupId The Id of the deleted group to be removed from the user documents
 */
function removeGroupId(groupId) {
    // In user collection, find users with deleted group Id in their array of groups and remove it
    User.update({ groupIds: { $in: [groupId] } }, { $pull: { groupIds: { $in: [groupId] } } }, { new: true }, function(err, updateResponse) {
        if (err) {  // if error in updating, print error message
            console.log("Error removing group from user documents : " , err);
        }
    })
}

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {Object} result The updated Group details to return
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2060, result, 'Group')
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
 * It deletes the group with input Id from the collection. It also deletes the Id of the group from all the users
 * documents.
 * @param {Object} options Contains the seneca instance
 */

module.exports = function(options) {
    var seneca = options.seneca;
    return function(args, done) {
        
        // load mongoose models for Users and Groups
        User = User || mongoose.model('Users');
        Group = Group || mongoose.model('Groups');
        
        // validate input parameters
        utils.checkInputParameters(args.body, GroupSchema)
            .then(function() {
                // verify, decode and check token
                return groupsLib.verifyTokenAndDecode(args);
            })
            .then(function(response) {
                // create temporary models pointing to organization related collections
                Group = mongoose.model('DynamicGroup', Group.schema, response.orgId + '_groups');
                User = mongoose.model('DynamicUser', User.schema, response.orgId + '_users');
                // fetch group from input group Id
                return fetchGroup(args.body.groupId, response.userId);
            })
            .then(function(response) {
                // remove group Id from all user documents
                removeGroupId(response.groupId);
                // delete group document from database
                return deleteGroup(args.body.groupId);
            })
            .then(function(response) {
                // delete temporary models
                delete mongoose.connection.models['DynamicGroup'];
                delete mongoose.connection.models['DynamicUser'];
                sendResponse(response, done);
            })
            .catch(function(err) {
                delete mongoose.connection.models['DynamicGroup'];
                delete mongoose.connection.models['DynamicUser'];
                console.log('err in delete Group---- ', err);

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