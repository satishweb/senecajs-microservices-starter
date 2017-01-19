'use strict';

var response = require(__base + '/sharedlib/utils');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var mongoose = require('mongoose');
var Promise = require('bluebird');
var jwt = require('jsonwebtoken');
var microtime = require('microtime');
var authentication = require(__base + '/sharedlib/authentication');
var groupsLib = require(__base + '/lib/groups');
var Group = null;
var User = null;

//Joi validation Schema
var addGroupSchema = Joi.object().keys({
    groupId: Joi.string().required(),
    userIds: Joi.array().items(Joi.string().required()).required()
});


/**
 * Check If Group is not General
 * @method checkGroup
 * @param {String}groupId Group Id
 * @returns {Promise} Promise containing the created Group details if successful, else containing the appropriate
 * error message
 */
function checkGroup(groupId) {
    return new Promise(function(resolve, reject) {
        Group.findOne({ _id: groupId }, function(err, findResponse) {
            if (err) {
                reject({ id: 400, msg: err });
            } else {
                if (lodash.isEmpty(findResponse)) {
                    reject({ id: 400, msg: 'Invalid Group Id' });
                } else if (findResponse.name.toLowerCase() === 'general') {
                    reject({ id: 400, msg: "Cannot Update General Group" })
                } else {
                    findResponse = JSON.parse(JSON.stringify(findResponse));
                    resolve(findResponse);
                }
            }
        });
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
            content: outputFormatter.format(true, 2250, null, 'Group')
        });
    } else {
        //else return error
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
}


function addUserToGroupCalls(options, args, done) {
    var seneca = options.seneca;
    var orgId = null;
    var isMicroservice = false;
    authentication.checkInputParameters(args.body, addGroupSchema)
        .then(function() {
            return groupsLib.verifyTokenAndDecode(args);
        })
        .then(function(response) {
            orgId = response.orgId;
            isMicroservice = response.isMicroservice;
            User = mongoose.model('DynamicUser', User.schema, orgId + '_users');
            Group = mongoose.model('DynamicGroup', Group.schema, orgId + '_groups');
            // console.log('response----------- ', response);
            if (response.isMicroservice) {
                // console.log('isMicroservice----------- ');
                if (args.body.groupId === 'general') {
                    return groupsLib.fetchGeneralGroup(Group, orgId)
                } else {
                    return new Promise(function(resolve) {
                        resolve(true);
                    });
                }
            } else {
                console.log("Checking Group for ---- ", args.body.groupId);
                return checkGroup(args.body.groupId);
            }
        })
        .then(function(response) {
            if (isMicroservice && args.body.groupId === 'users') {
                args.body.groupId = response;
            }
            console.log("Group id ----- ", args.body.groupId);
            groupsLib.addGroupInUser(User, args.body.groupId, args.body.userIds);
            return groupsLib.addUsers(Group, args.body.groupId, args.body.userIds, orgId, seneca)
        })
        .then(function(response) {
            delete mongoose.connection.models['DynamicGroup'];
            delete mongoose.connection.models['DynamicUser'];
            sendResponse(response, done);
        })
        .catch(function(err) {
            delete mongoose.connection.models['DynamicGroup'];
            delete mongoose.connection.models['DynamicUser'];
            console.log("Error in addUser ----- ", err);
            done(null, {
                statusCode: 200,
                content: response.error(err.id || 400, err.msg ? err.msg : 'Unexpected error', microtime.now())
            });
        });
}

//Joi validation Schema
var removeGroupSchema = Joi.object().keys({
    groupId: Joi.string().required(),
    userIds: Joi.array().items(Joi.string().required()).required()
});



/**
 * Fetch Group details
 * @method fetchGroup
 * @param {String}groupId Group Id
 * @param {Boolean}isMicroservice
 * @returns {Promise} Promise containing the Group details if successful, else containing the appropriate
 * error message
 */
function fetchGroup(groupId, isMicroservice) {
    return new Promise(function(resolve, reject) {
        Group.findOne({ _id: groupId }, function(err, findResponse) {
            if (err) {
                reject({ id: 400, msg: err });
            } else {
                if (lodash.isEmpty(findResponse)) {
                    reject({ id: 400, msg: 'Invalid Group Id' });
                } else if (isMicroservice == false && findResponse.name.toLowerCase() === 'users') {
                    reject({ id: 400, msg: "Cannot Update Users Group" })
                } else {
                    findResponse = JSON.parse(JSON.stringify(findResponse));
                    resolve(findResponse);
                }
            }
        });
    });
}

/**
 * Formats the output response and returns the response
 * @method removeSendResponse
 * @param {Object} result The updated Group details to return
 * @param {Function} done The done formats and sends the response
 */
function removeSendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2260, null, 'Group')
        });
    } else {
        //else return error
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
}


function removeUsersFromGroupCalls(options, args, done) {

    var seneca = options.seneca;
    var orgId = null;

    authentication.checkInputParameters(args.body, removeGroupSchema)
        .then(function() {
            return groupsLib.verifyTokenAndDecode(args);
        })
        .then(function(response) {
            orgId = response.orgId;
            User = mongoose.model('DynamicUser', User.schema, orgId + '_users');
            Group = mongoose.model('DynamicGroup', Group.schema, orgId + '_groups');
            if (response.isMicroservice) {
                return new Promise(function(resolve) {
                    resolve(true);
                })
            } else {
                return fetchGroup(args.body.groupId, false);
            }
        })
        .then(function() {
            groupsLib.removeGroupFromUser(User, args.body.groupId, args.body.userIds);
            return groupsLib.removeUsers(Group, args.body.groupId, args.body.userIds, orgId, seneca);
        })
        .then(function(response) {
            delete mongoose.connection.models['DynamicGroup'];
            delete mongoose.connection.models['DynamicUser'];
            removeSendResponse(response, done);
        })
        .catch(function(err) {
            delete mongoose.connection.models['DynamicUser'];
            delete mongoose.connection.models['DynamicGroup'];
            console.log("Error in removeUsers ---- ", err);
            done(null, {
                statusCode: 200,
                content: response.error(err.id || 400, err.msg ? err.msg : 'Unexpected error', microtime.now())
            });
        });
}

//Joi validation Schema
var GroupSchema = Joi.object().keys({
    groupId: Joi.string().required(),
    name: Joi.string(),
    description: Joi.string().allow(''),
    ownerId: Joi.string(),
});


/**
 * Update Group details
 * @method updateGroup
 * @param {Object} args input parameters
 * @param {Object} groupDetails Group details
 * @returns {Promise} Promise containing the created Group details if successful, else containing the appropriate
 * error message
 */
function updateGroup(args, groupDetails) {
    return new Promise(function(resolve, reject) {
        var updateData = lodash.omitBy(args, function(value) {
            return value === null || value === {};
        });
        delete updateData.groupId;
    });
}

/**
 * Formats the output response and returns the response
 * @method updateSendResponse
 * @param {Object} result The updated Group details to return
 * @param {Function} done The done formats and sends the response
 */
function updateSendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2050, result, 'Group')
        });
    } else {
        //else return error
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
}


function updateGroupCalls(options, args, done) {

    if (args.body.name) {
        args.body.name = args.body.name.toLowerCase()
    }
    authentication.checkInputParameters(args.body, GroupSchema)
        .then(function() {
            return groupsLib.verifyTokenAndDecode(args);
        })
        .then(function(response) {
            Group = mongoose.model('DynamicGroup', Group.schema, response.orgId + '_groups');
            // return fetchGroup(args.body.groupId, args.body.chatEnabled);
            return checkGroup(args.body.groupId);
        })
        .then(function(response) {
            return updateGroup(args.body, response);
        })
        .then(function(response) {
            delete mongoose.connection.models['DynamicGroup'];
            updateSendResponse(response, done);
        })
        .catch(function(err) {
            delete mongoose.connection.models['DynamicGroup'];
            console.log('err in update Group--- ', err);
            done(null, {
                statusCode: 200,
                content: response.error(err.id || 400, err.msg ? err.msg : 'Unexpected error', microtime.now())
            });
        });
}

module.exports = function(options) {
    return function(args, done) {
        Group = mongoose.model('Groups');
        User = mongoose.model('Users');
        switch (args.body.action) {
            case 'addUsers':
                delete args.body.action;
                addUserToGroupCalls(options, args, done);
                break;
            case 'removeUsers':
                delete args.body.action;
                removeUsersFromGroupCalls(options, args, done);
                break;
            case 'update':
                delete args.body.action;
                updateGroupCalls(options, args, done);
                break;
            default:
                done(null, {
                    statusCode: 200,
                    content: response.error(400, 'Enter a valid action', microtime.now())
                });
                break;
        }
    };
};