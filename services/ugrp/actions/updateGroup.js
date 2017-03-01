'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var Promise = require('bluebird');
var jwt = require('jsonwebtoken');
var microtime = require('microtime');
var Group = null;
var User = null;
var Team = null;

//Joi validation Schema
var addRemoveUserSchema = Joi.object().keys({
    action: Joi.string().valid('addUsers', 'removeUsers').required(),
    groupId: Joi.number(),
    groupName: Joi.string(),
    userIds: Joi.array().items(Joi.number().required()).required()
}).xor('groupId', 'groupName');

//Joi validation Schema
var updateGroupSchema = Joi.object().keys({
    action: Joi.string().valid('update').required(),
    groupId: Joi.string().required(),
    name: Joi.string(),
    description: Joi.string().allow(''),
    ownerId: Joi.string(),
});


/**
 * Validate input according to action and corresponding schema
 * @method checkInputParameters
 * @param {Object} input 
 * @returns {Promise} Resolved promise if the input is according to the schema, else rejected with appropriate error message
 */
function checkInputParameters(input) {
    if (input && input.action) {
        switch (input.action) {
            case 'addUsers':
            case 'removeUsers':
                return utils.checkInputParameters(input, addRemoveUserSchema);
                break;
            case 'update':
                return utils.checkInputParameters(input, updateGroupSchema);
                break;
            default:
                return Promise.reject({ id: 400, msg: "Invalid input. \"action\" is required and must be one of [\"addUsers\", \"removeUsers\", \"update\"]" });
        }
    } else {
        return Promise.reject({ id: 400, msg: "Invalid input. \"action\" is required and must be one of [\"addUsers\", \"removeUsers\", \"update\"]" });
    }
}

/**
 * Fetch group
 * @method fetchGroup
 * @param {Number} groupId Group Id
 * @returns {Promise} Promise containing the created Group details if successful, else containing the appropriate
 * error message
 */
/**
 * Fetch group
 * @method fetchGroup
 * @param {Number} teamId The team Id decoded from the JWT token
 * @param {Number} groupId Group Id of the group to fetch
 * @param {String} groupName Group Name of the group to fetch
 * @param {Boolean} isMicroservice Whether the caller is a microservice 
 * @returns {Promise} Resolved promise containing the fetched group if successful, else rejected promise with the appropriate error message
 */
function fetchGroup(action, teamId, groupId, groupName, isMicroservice) {
    var find = {};
    if (groupId) {
        find.groupId = groupId;
    } else if (groupName) {
        find.groupName = groupName;
    }
    find.teamId = teamId;
    var teamUsers = null;
    if (action === 'addUsers') {
        teamUsers = Team.findOne({
                where: { teamId: teamId },
                include: {
                    model: User,
                    attributes: ['userId'],
                    through: { attributes: [] }
                }
            })
            .then(function(team) {
                if (lodash.isEmpty(team)) {
                    return Promise.reject({ id: 400, msg: "Invalid teamId. Team not found." });
                } else {
                    // console.log("Team fetched ---- ", team.users);
                    var teamUsers = lodash.map(team.users, lodash.property('userId'));
                    console.log("Team users ---- ", teamUsers);
                    return teamUsers;
                }
            });
    }
    var group = Group.findOne({ where: find })
        .then(function(group) {
            if (lodash.isEmpty(group)) {
                return Promise.reject({ id: 400, msg: 'Invalid Group Id' });
            } else if (!isMicroservice && group.name.toLowerCase() === 'users' || group.name.toLowerCase() === 'admins') {
                return Promise.reject({ id: 400, msg: "Cannot update default groups." })
            } else {
                return group;
            }
        });

    return Promise.all([teamUsers, group]);
}

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {Object} result The updated Group details to return
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(action, result, done) {
    if (result !== null) {
        switch (action) {
            case 'addUsers':
                done(null, {
                    statusCode: 200,
                    content: outputFormatter.format(true, 2250, null, 'Group')
                });
                break;
            case 'removeUsers':
                done(null, {
                    statusCode: 200,
                    content: outputFormatter.format(true, 2260, null, 'Group')
                });
                break;
            case 'update':
                done(null, {
                    statusCode: 200,
                    content: outputFormatter.format(true, 2050, result, 'Group')
                });
                break;
            default:
                done(null, {
                    statusCode: 200,
                    content: outputFormatter.format(false, 102)
                });
        }
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
    var dbConnection = options.dbConnection;
    return function(args, done) {

        Group = Group || dbConnection.models.groups;
        User = User || dbConnection.models.users;
        Team = Team || dbConnection.models.teams;

        var teamId = null;
        var action = null;
        var isMicroservice = false;

        checkInputParameters(args.body)
            .then(function() {
                action = args.body.action;
                delete args.body.action;
                return utils.checkIfAuthorized(args.credentials, false, true);
            })
            .then(function() {
                teamId = args.credentials.teamId;
                isMicroservice = args.credentials.isMicroservice;
                return fetchGroup(action, teamId, args.body.groupId, args.body.groupName, isMicroservice);
            })
            .spread(function(teamUsers, group) {
                if (action === 'addUsers') {
                    // remove input users that are not part of the team
                    var userIds = lodash.intersection(args.body.userIds, teamUsers);
                    if (userIds.length !== args.body.userIds.length) {
                        return Promise.reject({ id: 400, msg: "Invalid input. One or more users to be added to the group are not present in the team." });
                    }
                }
                switch (action) {
                    case 'addUsers':
                        return group.addUsers(args.body.userIds);
                        break;
                    case 'removeUsers':
                        return group.removeUsers(args.body.userIds);
                        break;
                    case 'update':
                        delete updateData.groupId;
                        var updateData = lodash.omitBy(args.body, function(value) {
                            return value === null || value === {};
                        });
                        return group.update(args.body);
                    default:
                        done(null, {
                            statusCode: 200,
                            content: utils.error(400, "Invalid input. \"action\" is required and must be one of [\"addUsers\", \"removeUsers\", \"update\"]", microtime.now())
                        });
                }
            })
            .then(function(response) {
                sendResponse(action, response, done);
            })
            .catch(function(err) {
                console.log("Error in updateGroup ----- ", err);
                done(null, {
                    statusCode: 200,
                    content: utils.error(err.id || 400, err.message || err.msg || 'Unexpected error', microtime.now())
                });
            });
    };
};