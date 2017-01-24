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
 * @module createGroup
 */

//Joi validation Schema
var GroupSchema = Joi.object().keys({
    name: Joi.string().trim().invalid('General', 'general').required(),
    description: Joi.string().allow(''),
    userIds: Joi.array().items(Joi.string())
});

var microSchema = Joi.object().keys({
    name: Joi.string().trim().required(),
    description: Joi.string().allow(''),
    userIds: Joi.array().items(Joi.string())
});


/**
 * Create Group
 * @method createGroup
 * @param {String}ownerId Id of the organisation owner
 * @param {String}orgId Id of organization
 * @param {Object}input input parameters
 * @returns {Promise} Promise containing the created Group details if successful, else containing the appropriate
 * error message
 */
function createGroup(ownerId, orgId, input) {
    return new Promise(function(resolve, reject) {
        var data = {
            ownerId: ownerId,
            organizationId: orgId
        };
        if (input.name.toLowerCase() == 'general') {
            data.chatEnabled = true;
        }
        data = lodash.assign(data, input);
        var newGroup = new Group(data);
        newGroup.save(function(err, response) {
            if (err) {
                if (err.code === 11000) {
                    reject({ id: 400, msg: "Name already exists." });
                } else {
                    reject({ id: 400, msg: err.message });
                }
            } else {
                response = JSON.parse(JSON.stringify(response));
                resolve(response);
            }
        })
    });
}


/**
 * Fetch Organisation Details
 * @method fetchOrganizationDetails
 * @param {String}orgId Id of organization
 * @param {String}token JWT token
 * @param {Seneca}seneca
 * @returns {Promise} Promise containing the created Group details if successful, else containing the appropriate
 * error message
 */
//TODO: Remove this function and use from utils
function fetchOrganizationDetails(orgId, token, seneca) {
    return new Promise(function(resolve, reject) {
        utils.microServiceCall(seneca, 'organizations', 'getOrganization', {action: "fqdn", orgId: orgId}, token, 
            function(err, result) {
            if (err || !result.content.success) {
                reject({ id: 400, msg: err || result.content.message.description });
            } else {
                resolve(result.content.data);
            }
        })
    });
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
            content: outputFormatter.format(true, 2030, result, 'Group')
        });
    } else {
        //else return error
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
}


module.exports = function(options) {
    var seneca = options.seneca;
    return function(args, done) {
        var orgId = null;
        var groupId = null;
        var finalResponse = null;
        Group = mongoose.model('Groups');
        User = mongoose.model('Users');
        if (args.body.name) {
            args.body.name = args.body.name.toLowerCase()
        }
        groupsLib.verifyTokenAndDecode(args)
            .then(function(response) {
                orgId = response.orgId;
                Group = mongoose.model('DynamicGroup', Group.schema, orgId + '_groups');
                User = mongoose.model('DynamicUser', User.schema, orgId + '_users');
                if (response.isMicroservice) {
                    return utils.checkInputParameters(args.body, microSchema);
                } else {
                    return utils.checkInputParameters(args.body, GroupSchema)
                }
            })
            .then(function() {
                return fetchOrganizationDetails(orgId, args.header.authorization, seneca);
            })
            .then(function(response) {
                return createGroup(response.ownerId, response.orgId, args.body);
            })
            .then(function(response) {
                finalResponse = response;
                groupId = response.groupId;
                // return addUsersToDept(orgId, groupId, args.body.userIds, seneca);
                groupsLib.addGroupInUser(User, groupId, args.body.userIds);
                return groupsLib.addUsers(Group, groupId, args.body.userIds, orgId, seneca)
            })
            .then(function() {
                delete mongoose.connection.models['DynamicGroup'];
                delete mongoose.connection.models['DynamicUser'];
                sendResponse(finalResponse, done);
            })
            .catch(function(err) {
                delete mongoose.connection.models['DynamicGroup'];
                delete mongoose.connection.models['DynamicUser'];
                console.log("Error in create Group ---- ", err);
                done(null, {
                    statusCode: 200,
                    content: response.error(err.id || 400, err.msg ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};