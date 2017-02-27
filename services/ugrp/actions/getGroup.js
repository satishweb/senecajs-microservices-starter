'use strict';

var utils = require(__base + 'sharedlib/utils');
var InitCompositeGrid = require(__base + 'sharedlib/grid/initCompositeGrid');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var jwt = require('jsonwebtoken');
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var Group = null;
var Email = null;
var User = null;

var groupGetSchema = Joi.object().keys({
    action: Joi.string().trim().allow('list', 'id'),
    groupId: Joi.any().when('action', { is: 'id', then: Joi.number().required(), otherwise: Joi.any().forbidden() }),
    searchKeyword: Joi.any().when('action', { is: 'list', then: Joi.object(), otherwise: Joi.any().forbidden() }),
    filter: Joi.any().when('action', { is: 'list', then: Joi.object(), otherwise: Joi.any().forbidden() }),
    sort: Joi.any().when('action', { is: 'list', then: Joi.object(), otherwise: Joi.any().forbidden() }),
    limit: Joi.any().when('action', { is: 'list', then: Joi.number(), otherwise: Joi.any().forbidden() }),
    page: Joi.any().when('action', { is: 'list', then: Joi.number(), otherwise: Joi.any().forbidden() })
}).without('groupId', ['searchKeyword', 'filter', 'sort', 'limit', 'page']);

/**
 * Fetch Group details
 * @method fetchContacts
 * @returns {Promise} Promise containing the Contact details if resolved, else the error message
 */
function fetchGroup(groupId, teamId) {
    return Group.findOne({
            where: { groupId: groupId, teamId: teamId },
            include: {
                model: User,
                attributes: ['userId', 'firstName'],
                include: { model: Email, as: 'emails', attributes: ['email'] },
                through: {
                    attributes: []
                }
            }
        })
        .then(function(group) {
            if (lodash.isEmpty(group)) {
                return Promise.reject({ id: 400, msg: 'Group not found.' });
            } else {
                return group;
            }
        })
        .catch(function(err) {
            return Promise.reject({ id: 400, msg: err });
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
        if (result.data) {
            result = result.data;
            delete result.configuration;
        }
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2040, result, 'Groups')
        });
    } else {
        //else return error
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
}


function listGroups(input, teamId, dbConnection) {
    var config = {};
    var collection = {
        "groupId": {
            "databaseName": "groupId",
            "displayName": "Group Id",
            "filter": true
        },
        "users": {
            "databaseName": "$users.userId$",
            "displayName": "Users",
            "filter": true,
            "join": {
                model: 'users',
                fields: ['userId', 'firstName'],
                exclude: ['join_usergroups']
            }
        },
        "team": {
            "databaseName": "$team.teamId$",
            "displayName": "Team",
            "filter": true,
            "join": {
                model: 'teams',
                as: 'team',
                fields: ['teamId', 'name', 'subDomain']
            }
        },
        "owner": {
            "databaseName": "$owner.userId$",
            "displayName": "Owner",
            "filter": true,
            "join": {
                model: 'users',
                as: 'owner',
                fields: ['userId', 'firstName']
            }
        },
        "name": {
            "displayName": "Group Name",
            "search": true,
            "sort": true
        },
        "description": {
            "displayName": "Description"
        }
    };
    config = { 'listGroups': { 'collections': {} } };
    config.listGroups.collections['groups'] = collection;
    if (lodash.isEmpty(input.filter)) {
        input.filter = {};
    }
    if (teamId) {
        input.filter.team = [teamId];
    }
    delete input.action;
    var compositeGrid = InitCompositeGrid.initFromConfigObject(input, 'listGroups', dbConnection, null, config);
    return compositeGrid.fetch()
}


module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;

    return function(args, done) {

        Group = Group || dbConnection.models.groups;
        Email = Email || dbConnection.models.emails;
        User = User || dbConnection.models.users;

        utils.checkInputParameters(args.body, groupGetSchema)
            .then(function() {
                switch (args.body.action) {
                    case 'list':
                        return listGroups(args.body, args.credentials.teamId, dbConnection);
                        break;
                    case 'id':
                        return fetchGroup(args.body.groupId, args.credentials.teamId);
                        break;
                    default:
                        return new Promise(function(resolve, reject) {
                            reject({ id: 400, msg: "Invalid input. \"action\" must be present and one of [\"id\", \"list\"]" });
                        });
                }
            })
            .then(function(result) {
                sendResponse(result, done);
            })
            .catch(function(err) {
                console.log("Error in getGroups ---- ", err);
                var error;
                if (err && 'success' in err) {
                    error = err;
                } else {
                    error = err ? { id: err.id || 1000, msg: JSON.stringify(err.msg) || err.message || "Unexpected error" } : { id: 1000, msg: "Unexpected error" };
                    error = outputFormatter.format(false, 1000, null, error.msg);
                }

                // in case of error, print the error and send as response
                utils.senecaLog(seneca, 'error', __filename.split('/').pop(), error);

                done(null, {
                    statusCode: 200,
                    content: error
                });
            });
    };
};