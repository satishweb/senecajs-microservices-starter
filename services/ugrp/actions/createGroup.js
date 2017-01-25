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

// Joi validation Schema for API call
// User cannot create group named 'user', microservice creates that as default on creating organization
var GroupSchema = Joi.object().keys({
    name: Joi.string().trim().invalid('Users', 'users').required(),
    description: Joi.string().allow(''),
    userIds: Joi.array().items(Joi.string())
});

// Joi validation schema for microservice call
// Microservice can create 'user' group
var microSchema = Joi.object().keys({
    name: Joi.string().trim().required(),
    description: Joi.string().allow(''),
    userIds: Joi.array().items(Joi.string())
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
            organizationId: orgId
        };

        // merge the created object and input
        data = lodash.assign(data, input);
        
        // create instance of model using group data
        var newGroup = new Group(data);
        
        // save group document
        newGroup.save(function(err, response) {
            if (err) {  // if error, check if error code represents duplicate index on unique field (name)
                if (err.code === 11000) { // if error code is 11000, it means the name already exists
                    // reject with custom error message
                    reject({ id: 400, msg: "Name already exists." });
                } else {    // in case of other errors, reject received error
                    reject({ id: 400, msg: err.message });
                }
            } else {    // if group saved successfully, resolve created document
                response = JSON.parse(JSON.stringify(response));    // force mongoose transform
                resolve(response);
            }
        })
    });
}


/**
 * Fetch Organisation Details
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
    return function(args, done) {

        var orgId = null;   // stores the organization Id
        var groupId = null;
        var finalResponse = null;

        // load mongoose models for Groups and Users
        Group = mongoose.model('Groups');
        User = mongoose.model('Users');

        // if group name is specified in input, convert it to lowercase (for sorting)
        if (args.body.name) {
            args.body.name = args.body.name.toLowerCase()
        }

        // verify and decode token to get organization Id and if call has come from microservice
        groupsLib.verifyTokenAndDecode(args)
            .then(function(response) {
                orgId = response.orgId; // store the organization Id for further use

                // create temporary models pointing to organization related collections
                Group = mongoose.model('DynamicGroup', Group.schema, orgId + '_groups');
                User = mongoose.model('DynamicUser', User.schema, orgId + '_users');
                
                // validate input according to appropriate Joi schema
                if (response.isMicroservice) {
                    return utils.checkInputParameters(args.body, microSchema);
                } else {
                    return utils.checkInputParameters(args.body, GroupSchema)
                }
            })
            .then(function() {
                // fetch organization details from organization Id
                return fetchOrganizationDetails(orgId, args.header.authorization, seneca);
            })
            .then(function(response) {
                // create group from input details and organization details
                return createGroup(response.ownerId, response.orgId, args.body);
            })
            .then(function(response) {
                
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
                
                // delete the temporary models
                delete mongoose.connection.models['DynamicGroup'];
                delete mongoose.connection.models['DynamicUser'];
                
                // send stored response in reply
                sendResponse(finalResponse, done);
            })
            .catch(function(err) {
                console.log("Error in create Group ---- ", err);
                
                // delete the temporary models in case of error
                delete mongoose.connection.models['DynamicGroup'];
                delete mongoose.connection.models['DynamicUser'];

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