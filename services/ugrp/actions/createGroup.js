'use strict';

var utils = require(__base + '/sharedlib/utils');
var groupsLib = require(__base + '/lib/groups');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var waterline = require('waterline');
var Promise = require('bluebird');
var microtime = require('microtime');
var Group = null;
var User = null;

/**
 * @module createGroup
 */

// Joi validation Schema for API call
// User cannot create group named 'user', microservice creates that as default on creating organization
var groupSchema = Joi.object().keys({
    name: Joi.string().trim().invalid('Users', 'users').required(),
    description: Joi.string().allow(''),
    userIds: Joi.array().items(Joi.number())
});

// Joi validation schema for microservice call
// Microservice can create 'user' group
var microSchema = Joi.object().keys({
    name: Joi.string().trim().required(),
    description: Joi.string().allow(''),
    userIds: Joi.array().items(Joi.number())
});


/**
 * Create Group from input parameters
 * @method createGroup
 * @param {String} ownerId Id of the organisation owner
 * @param {String} orgId Id of organization
 * @param {Object} input input parameters
 * @returns {Promise} Promise containing the created Group details if successful, else containing the appropriate
 * error message
 */
function createGroup(ownerId, orgId, input) {
    return new Promise(function(resolve, reject) {

        // create object containing fields to be added to group input object
        var data = {
            ownerId: ownerId,
            orgId: orgId
        };

        // copying userIds into another variable and deleting it from input 
        var userIds = input.userIds;
        delete input.userIds;

        // merge the created object and input
        data = lodash.assign(data, input);
        
        // create new group
        Group.create(data)
        .then(function(createdGroup) {
            console.log("Group after saving ---- ", createdGroup);
            // if group saved successfully, add the users to the group
            userIds.forEach(function (userId) {
                createdGroup.userIds.add(userId);
            })
            return createdGroup.save();
        })
        .then(function (updatedGroup) {
            console.log("Group after updating ---- ", updatedGroup);
            resolve(updatedGroup);
        })
        .catch(function (err) {  // if error, check if error code represents duplicate index on unique field (name)
            console.log("Error in create group ---- ", err);
            if (err.code === 'E_VALIDATION') { // if error code is 11000, it means the name already exists
                // reject with custom error message
                reject({ id: 400, msg: "Group name already exists." });
            } else {    // in case of other errors, reject received error
                reject({ id: 400, msg: err.message });
            }
        })
    });
}


/**
 * Fetch Organization Details
 * @method fetchOrganizationDetails
 * @param {String} orgId Id of the organization
 * @param {String} token JWT token
 * @param {Seneca} seneca The Seneca instance
 * @returns {Promise} Promise containing the matching organization details if successful, else containing the
 * appropriate error message
 */

function fetchOrganizationDetails(orgId, token, seneca) {
    return new Promise(function(resolve, reject) {
        // fetch organization details based on the organization Id
        utils.microServiceCall(seneca, 'organizations', 'getOrganization', {action: "id", orgId: orgId}, token,
            function(err, result) {
            if (err || !result.content.success) {   // if error or unsuccessful, return error message
                reject({ id: 400, msg: err || result.content.message.description });
            } else {    // if successful, return the fetched organization
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

/**
 * This is a POST action for the UGRP microservice
 * It creates a new group from the input details with the user as it's owner. User cannot create group called
 * 'users'. This name can only be used by microservices to create default group. If group name is already present,
 * error is returned.
 * Optionally, users can be added to the group while creating the group. It adds the Ids of the user to the group and
 * also the group Id to each users groups.
 * @param {Object} options Contains the seneca instance
 */

module.exports = function(options) {
    var seneca = options.seneca;
    var ontology = options.wInstance;
    return function(args, done) {

        var orgId = null;   // stores the organization Id
        var groupId = null;
        var finalResponse = null;

        // load mongoose models for Groups and Users
        Group = Group || ontology.collections.groups;
        User = User || ontology.collections.users;

        // if group name is specified in input, convert it to lowercase (for sorting)
        /*if (args.body.name) {
            args.body.name = args.body.name.toLowerCase()
        }*/

        orgId = args.credentials.orgId; // store the organization Id for further use

        console.log("DecodedToken ---- ", args.credentials);
        utils.checkInputParameters(args.body, args.credentials.isMicroservice ? microSchema : groupSchema)
            .then(function () {
                console.log("Input parameters verified ----- ", orgId);
                // fetch organization details from organization Id
                return fetchOrganizationDetails(orgId, args.header.authorization, seneca);
            })
            .then(function (response) {
                console.log("Org details ---- ", response);
                // create group from input details and organization details
                return createGroup(args.credentials.userId, response.orgId, args.body);
            })
            .then(function(response) {
                console.log("Group details ---- ", response);
                // store the result of crete group for replying later
                finalResponse = response;
                groupId = response.groupId; // store the Id of the newly created group
                
                // if users to be added to group are sent in input, add group Id in users' documents
                if (args.body.userIds) {
                    groupsLib.addGroupInUser(User, groupId, args.body.userIds);
                }
                // add user Ids to group document
                return groupsLib.addUsers(Group, groupId, args.body.userIds)
            })
            .then(function() {
                // send stored response in reply
                sendResponse(finalResponse, done);
            })
            .catch(function(err) {
                console.log("Error in create Group ---- ", err);

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