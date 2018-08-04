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
var Team = null;
var Email = null;
var User = null;
var Role = null;
var Permission = null;

var permissionGetSchema = Joi.object().keys({
    action: Joi.string().trim().allow('list', 'id'),
    permissionId: Joi.any().when('action', { is: 'id', then: Joi.number().required(), otherwise: Joi.any().forbidden() }),
    searchKeyword: Joi.any().when('action', { is: 'list', then: Joi.object(), otherwise: Joi.any().forbidden() }),
    filter: Joi.any().when('action', { is: 'list', then: Joi.object(), otherwise: Joi.any().forbidden() }),
    sort: Joi.any().when('action', { is: 'list', then: Joi.object(), otherwise: Joi.any().forbidden() }),
    limit: Joi.any().when('action', { is: 'list', then: Joi.number(), otherwise: Joi.any().forbidden() }),
    page: Joi.any().when('action', { is: 'list', then: Joi.number(), otherwise: Joi.any().forbidden() })
}).without('permissionId', ['searchKeyword', 'filter', 'sort', 'limit', 'page']);

/**
 * Fetch Permission details
 * @method fetchPermission
 * @param {Number} permissionId The id of the permission whose details are to be fetched
 * @param {Number} teamId The Id of the team to which the permission belongs
 * @returns {Promise} Promise containing the Permission details if resolved, else the error message
 */
function fetchPermission(permissionId, teamId) {
    return Permission.findOne({
            where: { permissionId: permissionId, teamId: teamId },
            include: [{
                model: User,
                attributes: ['userId', 'firstName'],
                include: { model: Email, as: 'emails', attributes: ['email'] },
                through: {
                    attributes: []
                }
            }, {
                model: Group,
                attributes: ['groupId', 'name'],
                through: {
                    attributes: []
                }    
            }, {
                model: Permission,
                attributes: ['permissionId', 'resource', 'permission'],
                through: {
                    attributes: []
                }
            }]
        })
        .then(function(permission) {
            if (lodash.isEmpty(permission)) {
                return Promise.reject({ id: 400, msg: 'Permission not found in your team.' });
            } else {
                return permission;
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
        if (result.data) {
            result = result.data;
            delete result.configuration;
        }
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2040, result, 'Permissions')
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
 * Fetch a paginated list of results after searching, filtering and ordering on the fields allowed by the configuration
 * @method listPermissions
 * @param {Object} input The input object
 * @param {Number} teamId The Id of the team whose Permissions are to be listed
 * @param {Sequelize} dbConnection The Sequelize connection object
 * @returns {Promise} Promise containing the list of found Permissions according to the input is successful, or else the appropriate error message
 */
function listPermissions(input, teamId, dbConnection) {
    var config = {};
    var collection = {
        "permissionId": {
            "databaseName": "permissionId",
            "displayName": "permission Id",
            "filter": true
        },
        "roles": {
            "databaseName": "$roles.roleId$",
            "displayName": "Roles",
            "filter": true,
            "join": {
                model: 'roles',
                fields: ['roleId'],
                exclude: ['join_rolepermissions']
            }
        },
        "permission": {
            "displayName": "Permission"
        },
        "description": {
            "displayName": "Description"
        },
        "resource": {
            "displayName": "Resource"
        }
    };
    config = { 'listPermissions': { 'collections': {} } };
    config.listPermissions.collections['permissions'] = collection;
    // if (lodash.isEmpty(input.filter)) {
    //     input.filter = {};
    // }
    // if (teamId) {
    //     input.filter.team = [teamId];
    // }
    delete input.action;
    var compositeGrid = InitCompositeGrid.initFromConfigObject(input, 'listPermissions', dbConnection, null, config);
    return compositeGrid.fetch()
}


module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;

    return function(args, done) {

        Group = Group || dbConnection.models.groups;
        Email = Email || dbConnection.models.emails;
        User = User || dbConnection.models.users;
        Team = Team || dbConnection.models.teams;
        Role = Role || dbConnection.models.roles;
        Permission = Permission || dbConnection.models.permissions;

        utils.checkInputParameters(args.body, permissionGetSchema)
            .then(function () {
                return utils.checkIfAuthorized(args.credentials, true, true);
            })    
            .then(function() {
                switch (args.body.action) {
                    case 'list':
                        return listPermissions(args.body, args.credentials.teamId, dbConnection);
                        break;
                    case 'id':
                        return fetchPermission(args.body.permissionId, args.credentials.teamId);
                        break;
                    default:
                        return Promise.reject({ id: 400, msg: "Invalid input. \"action\" must be present and one of [\"id\", \"list\"]" });
                }
            })
            .then(function(result) {
                sendResponse(result, done);
            })
            .catch(function(err) {
                console.log("Error in getPermission ---- ", err);
                var error;
                if (err && 'success' in err) {
                    error = err;
                } else {
                    error = err ? { id: err.id || 1000, msg: err.msg || err.message || "Unexpected error" } : { id: 1000, msg: "Unexpected error" };
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