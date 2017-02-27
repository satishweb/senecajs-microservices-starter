'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var Promise = require('bluebird');
var microtime = require('microtime');
var Group = null;
var User = null;

/**
 * @module deleteGroup
 */

//Joi validation Schema
var GroupSchema = Joi.object().keys({
    groupId: Joi.number().required()
});

/**
 * Delete Group
 * @method deleteGroup
 * @param {String} groupId Id of the group to be deleted
 * @returns {Promise} Empty Promise if group is successfully deleted, else containing the appropriate error message
 */

function deleteGroup(groupId) {
    return Group.findOne({ where: { groupId: groupId } })
        .then(function(group) {
            if (lodash.isEmpty(group)) { // check for empty response, meaning group Id is incorrect
                return Promise.reject({ id: 400, msg: "Invalid Group Id" });
            } else if (group.name.toLowerCase() == 'users' || group.name.toLowerCase() == 'admins') { // check if group being deleted is the default group
                // which can't be deleted
                return Promise.reject({ id: 400, msg: "Cannot delete users/admins groups" });
            } else {
                return group.destroy();
            }
        });
}

/**
 * This is a DELETE action for the UGRP microservice
 * It deletes the group with input Id from the collection. It also deletes the Id of the group from all the users
 * documents.
 * @param {Object} options Contains the seneca instance
 */

module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function(args, done) {

        // load database models for Users and Groups
        User = User || dbConnection.models.users;
        Group = Group || dbConnection.models.groups;

        // validate input parameters
        utils.checkInputParameters(args.body, GroupSchema)
            .then(function() {
                // verify, decode and check token
                return utils.checkIfAuthorized(args.credentials);
            })
            .then(function(response) {
                // delete group document from database
                return deleteGroup(args.body.groupId);
            })
            .then(function(response) {
                done(null, {
                    statusCode: 200,
                    content: outputFormatter.format(true, 2060, null, 'Group')
                });
            })
            .catch(function(err) {
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