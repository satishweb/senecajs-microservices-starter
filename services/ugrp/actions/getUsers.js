'use strict';

var utils = require(__base + '/sharedlib/utils');
var InitCompositeGrid = require(__base + '/sharedlib/grid/initCompositeGrid');
var Joi = require('joi');
var jwt = require('jsonwebtoken');
var lodash = require('lodash');
var Locale = require(__base + '/sharedlib/formatter.js');
var outputFormatter = new Locale(__base);
var Promise = require('bluebird');
var microtime = require('microtime');
var User = null;

/**
 * @module getUsers
 */

// create Joi schema
//TODO: move this
var userGetSchema = Joi.object().keys({
    action: Joi.string().trim().allow('list', 'id'),
    userId: Joi.any().when('action', { is: 'id', then: Joi.number().required(), otherwise: Joi.any().forbidden() }),
    searchKeyword: Joi.any().when('action', { is: 'list', then: Joi.object(), otherwise: Joi.any().forbidden() }),
    filter: Joi.any().when('action', { is: 'list', then: Joi.object(), otherwise: Joi.any().forbidden() }),
    sort: Joi.any().when('action', { is: 'list', then: Joi.object(), otherwise: Joi.any().forbidden() }),
    limit: Joi.any().when('action', { is: 'list', then: Joi.number(), otherwise: Joi.any().forbidden() }),
    page: Joi.any().when('action', { is: 'list', then: Joi.number(), otherwise: Joi.any().forbidden() })
}).without('userId', ['searchKeyword', 'filter', 'sort', 'limit', 'page']);

/**
 * Get the user details corresponding to the user Id
 * @param {Number} userId The id of the user whose details are to be fetched
 * @returns {Promise} Promise containing the user details if successful or the error message if unsuccessful
 */
function getUser(userId, teamId) {
    return new Promise(function (resolve, reject) {
        
        //TODO: Confirm if there is supposed to be a org check when fetching users
        
        User.findOne({ where: { userId: userId, isDeleted: false }, attributes: { exclude: ['password'] } })
            .then( function(result) {
                if (lodash.isEmpty(result)) {
                    reject({ id: 400, msg: "User not found." });
                } else {
                    resolve(result.toJSON());
                }
            })
            .catch(function (err) {
                reject({ id: 400, msg: err.message }); 
            })
    });
};

/**
 * Fetches the paginated list of users who match the search/filter criteria.
 * @param {Object} input The input containing the search, filter, sort, page and limit fields
 * @param {Object} teamId The Id of the team for which the users are to be fetched
 * @returns {Promise} Promise containing the result returned by Grid library
 */
function listUsers(input, teamId, dbConnection) {
    var compositeGrid;
    var collection = {
        "userId": {
            "displayName": "User Id",
            "filter": true
        },
        "avatar": {
            "displayName": "Avatar"
        },
        "firstName": {
            "displayName": "First Name",
            "search": true,
            "sort": true
        },
        "lastName": {
            "displayName": "Last Name",
            "search": true
        },
        "email": {
            "databaseName": "$emails.email$",
            "displayName": "Email",
            "filter": true,
            "search": true,
            "sort": true,
            "join": {
                model: 'emails',
                as: 'emails',
                fields: ['email']
            }
        },
        "ownedTeam": {
            "databaseName": "$ownedTeams.teamId$",
            "filter": true,
            "displayName": "Owned Teams",
            "join": {
                model: 'teams',
                as: 'ownedTeams',
                fields: ['teamId', 'name', 'subDomain']
            }
        },
        "teamId": {
            "databaseName": "$teams.teamId$",
            "displayName": "Team Id",
            "filter": true,
            "join": {
                model: 'teams',
                fields: ['teamId', 'name', 'subDomain'],
                exclude: ['join_userteams']
            }
        },
        "groupId": {
            "databaseName": "$groups.groupId$",
            "displayName": "Group Id",
            "filter": true,
            "join": {
                model: 'groups',
                as: '',
                fields: ['groupId', 'name'],
                exclude: ['join_usergroups']
            }
        },
        "isDeleted": {
            "show": false,
            "filter": true
        }
    };

    var config = { 'listUsers': { 'collections': {} }};
    config.listUsers.collections['users'] = collection;
    delete input.action;
    if (teamId) {
        input.teamId = teamId;
    }
    if (lodash.isEmpty(input.filter)) {
        input.filter = {};
    }
    input.filter.isDeleted = false;
    compositeGrid = InitCompositeGrid.initFromConfigObject(input, 'listUsers', dbConnection, null, config);
    return compositeGrid.fetch()
};

/**
 * Formats the output response and returns the response.
 * @function sendResponse
 * @param {Object} result - The final result to return.
 * @param {Function} done - the done formats and sends the response.
 *
 */
var sendResponse = function(result, done) {
    if (result !== null) {
        if (result && result.data) {
            result = result.data;
            delete result.configuration;
        }
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2040, result, "Users")
        });
    } else {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 1060, null, "Users")
        });
    }
};


/**
 * This is a POST action for the User microservice
 * It fetches a single user corresponding to the user Id or a list of users based on the search criteria
 */
module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function (args, done) {
        
        User = User || dbConnection.models.users;
        utils.checkInputParameters(args.body, userGetSchema)
            .then(function() {
                return utils.verifyTokenAndDecode(args.header.authorization)
            })
            .then(function(decoded) {
                switch (args.body.action) {
                    case 'list':
                        return listUsers(args.body, decoded.teamId, dbConnection);
                        break;
                    case 'id':
                        return getUser(args.body.userId, decoded.teamId);
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
                console.log("Error in getUsers ---- ", err);
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