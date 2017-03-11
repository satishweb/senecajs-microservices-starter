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
var Role = null;
var Permission = null;

//Joi validation Schema for add/remove Users
var addRemoveUsersSchema = Joi.object().keys({
    action: Joi.string().valid('addUsers', 'removeUsers').required(),
    roleId: Joi.number().required(),
    userIds: Joi.array().items(Joi.number().required()).required()
});

//Joi validation Schema for add/remove Groups
var addRemoveGroupsSchema = Joi.object().keys({
    action: Joi.string().valid('addGroups', 'removeGroups').required(),
    roleId: Joi.number().required(),
    groupIds: Joi.array().items(Joi.number().required()).required()
});

//Joi validation Schema for add/remove Permissions
var addRemovePermissionsSchema = Joi.object().keys({
    action: Joi.string().valid('addPermissions', 'removePermissions').required(),
    roleId: Joi.number().required(),
    permissionIds: Joi.array().items(Joi.number().required()).required()
});

//Joi validation Schema for add/remove Roles to Group
var addRemoveRolesToGroupSchema = Joi.object().keys({
    action: Joi.string().valid('addRolesToGroup', 'removeRolesFromGroup').required(),
    groupId: Joi.number(),
    groupName: Joi.string(),
    roleIds: Joi.array().items(Joi.number().required()).required()
}).xor('groupId', 'groupName'); // should have either groupId or groupName, not both

//Joi validation Schema for add/remove Roles to User
var addRemoveRolesToUserSchema = Joi.object().keys({
    action: Joi.string().valid('addRolesToUser', 'removeRolesFromUser').required(),
    userId: Joi.number().required(),
    roleIds: Joi.array().items(Joi.number().required()).required()
});

//Joi validation Schema for update role details
var updateRoleSchema = Joi.object().keys({
    action: Joi.string().valid('update').required(),
    roleId: Joi.string().required(),
    name: Joi.string(),
    description: Joi.string().allow(''),
    ownerId: Joi.string(),
});


/**
 * Validate input according to action and corresponding schema
 * @method checkInputParameters
 * @param {Object} input The input body
 * @returns {Promise} Resolved promise if the input is according to the schema, else rejected with appropriate error message
 */
function checkInputParameters(input) {
    if (input && input.action) { // check if input is present and action is present in input
        // depending on the action use the corresponding schema to validate the input. If none of the actions match return error
        switch (input.action) {
            case 'addUsers':
            case 'removeUsers':
                return utils.checkInputParameters(input, addRemoveUsersSchema);
                break;
            case 'addGroups':
            case 'removeGroups':
                return utils.checkInputParameters(input, addRemoveGroupsSchema);
                break;
            case 'addPermissions':
            case 'removePermissions':
                return utils.checkInputParameters(input, addRemovePermissionsSchema);
                break;
            case 'addRolesToGroup':
            case 'removeRolesFromGroup':
                return utils.checkInputParameters(input, addRemoveRolesToGroupSchema);
                break;
            case 'addRolesToUser':
            case 'removeRolesFromUser':
                return utils.checkInputParameters(input, addRemoveRolesToUserSchema);
                break;
            case 'update':
                return utils.checkInputParameters(input, updateRoleSchema);
                break;
            default:
                return Promise.reject({
                    id: 400,
                    msg: "Invalid input. \"action\" is required and must be one of" +
                    "[\"addUsers\", \"removeUsers\", \"addGroups\", \"removeGroups\", \"addPermissions\", " +
                    "\"removePermissions\", \"addRolesToGroup\", \"removeRolesFromGroup\", \"addRolesToUser\", " +
                    "\"removeRolesFromUser\", \"update\"]."
                });
        }
    } else { // if action is not present in the input return error.
        return Promise.reject({
            id: 400,
            msg: "Invalid input. \"action\" is required and must be one of" +
                    "[\"addUsers\", \"removeUsers\", \"addGroups\", \"removeGroups\", \"addPermissions\", " +
                    "\"removePermissions\", \"addRolesToGroup\", \"removeRolesFromGroup\", \"addRolesToUser\", " +
                    "\"removeRolesFromUser\", \"update\"]."
        });
    }
}

/**
 * Fetch role instance to update, add/remove users or groups. For add users/groups, also fetch users/groups belonging to the team to check if input users/groups belong to the team.
 * Similarly, for remove users/groups fetch the users/groups already added to the role to check if the input users/groups belong to the role.
 * @method fetchRole
 * @param {String} action The action being performed
 * @param {Number} teamId The team Id decoded from the JWT token
 * @param {Object} input The input object 
 * @returns {Promise} Resolved promise containing the fetched role if successful, else rejected promise with the appropriate error message
 */
function fetchInstance(action, teamId, input) {
    var find = { where: {}};
    var model = null;

    var modelInstance = null; // for the promise containing model instance returned by find model (role, group or user)
    var validInputs = null; // for the promise containing the valid input values to add or remove
    
    // create find query for fetching instance of either Role, Group or User
    if (input.roleId) {
        find.where.roleId = input.roleId;
        model = Role;
        find.where.teamId = teamId; // add team Id to find query to enforce that the role must belong to this team only
    } else if (input.groupId) {
        find.where.groupId = input.groupId;
        model = Group;
        find.where.teamId = teamId; // add team Id to find query to enforce that the role must belong to this team only
    } else if (input.groupName) {
        find.where.groupName = input.groupName;
        model = Group;
        find.where.teamId = teamId; // add team Id to find query to enforce that the role must belong to this team only
    } else if (input.userId) {
        find.where.userId = input.userId;
        find.include = {
            model: Team,
            where: { teamId: teamId},
            attributes: ['teamId'],
            through: { attributes: [] } 
        };
        model = User;
    }

    // console.log("Model ---- ", model, find); 

    // fetch instance by find query created and assign returned promise to variable
    modelInstance = model.findOne(find)
        .then(function (instance) {
            // console.log("Returned instance ---- ", instance);
            // if no model is found, return error message
            if (lodash.isEmpty(instance)) {
                return Promise.reject(outputFormatter.format(false, 1100, null, 'Role'));
            } else {
                return instance;
            }
        });

    // if action is addUsers, fetch users belonging to the team to check if users to be added to role are present in the team
    if (action === 'addUsers') {
        validInputs = getValidInputs(teamId, input.userIds, 'user');
    } else if (action === 'addGroups') {
        // if action is addGroups, fetch groups belonging to the team to check if the groups to be added to role belong to team
        validInputs = getValidInputs(teamId, input.groupIds, 'group');
    } else if (action === 'addPermissions') {
        // if action is addPermissions, fetch Permissions
        validInputs = getValidInputs(teamId, input.permissionIds, 'permission');
    } else if (action === 'addRolesToGroup' || action === 'addRolesToUser') {
        // if action is addRolesToGroup or addRolesToUser, fetch valid Roles
        validInputs = getValidInputs(teamId, input.roleIds, 'role');
    } else if (action === 'removeUsers') {
        // if action is removeUsers, fetch the users already added to the role to check if users to be removed are present in the role
        validInputs = getRoleAttributes(modelInstance, input.userIds, 'user');
    } else if (action === 'removeGroups') {
        // if action is removeGroups, fetch the groups already added to the role to check if groups to be removed are present in the role
        validInputs = getRoleAttributes(modelInstance, input.groupIds, 'group');
    } else if (action === 'removePermissions') {
        // if action is removePermissions, fetch the permissions already added to the role to check if permissions to be removed are present in the role
        validInputs = getRoleAttributes(modelInstance, input.permissionIds, 'permission');
    } else if (action === 'removeRolesFromGroup' || action === 'removeRolesFromUser') {
        // if action is removeRolesToGroup or removeRolesToUser, fetch the roles already added to the group/user to check if roles to be removed are present for the group/user
        validInputs = getRoleAttributes(modelInstance, input.roleIds, 'role');
    } 

    // return when all promises have completed
    return Promise.all([modelInstance, validInputs]);
}

/**
 * Fetch valid inputs by checking if they belong to the team
 * @method getValidInputs
 * @param {Number} teamId The Id of the team
 * @param {Number[]} inputIds The array of input Ids
 * @param {String} attributeName Name of the attribute to be fetched
 * @returns {Promise} Resolved Promise containing the array of valid input Ids, else rejected Promise containing the appropriate error message
 */
function getValidInputs(teamId, inputIds, attributeName) {

    // console.log("GetValidInputs called ---- ", teamId, inputIds, attributeName);

    var model;

    // create find query for user/role using input Ids
    var find = {
        where: {}
    };

    // add the input Ids to the where of the find query
    find.where[attributeName + 'Id'] = { $in: inputIds };

    // if attribute is user, add the team model to the include part of the find query with the team Id to match
    if (attributeName === 'user') {
        model = User;
        find.include = {
            model: Team,
            where: {teamId: teamId},
            attributes: ['teamId'],
            through: { attributes: [] } 
        };
    } else if (attributeName === 'group') { // if attribute is group add the team Id to the where clause of the find query
        model = Group;
        find.where.teamId = teamId;
    } else if (attributeName === 'permission') { // if attribute is permission add the team Id to the where clause of the find query
        model = Permission;
    } else if (attributeName === 'role') { // if attribute is role add the team Id to the where clause of the find query
        model = Role;
        find.where.teamId = teamId;
    }

    // console.log("Model ---- ", model, "\nFind ----- ", find);

    // find attribute with team Id and return array of valid Ids
    return model.findAll(find)
        .then(function(findResult) {
            // if result is empty, return error message
            if (lodash.isEmpty(findResult)) {
                return [];
            } else {
                // if find result is not empty, create array of valid Ids to return from the fetched attribute objects
                var validInputs = lodash.map(findResult, lodash.property(attributeName + 'Id'));

                return validInputs;
            }
        });
}

/**
 * Fetch the attributes (users or groups) already present in the role, to check if the input attribute values can be removed from the role
 * @method getRoleAttributes
 * @param {Promise} instancePromise The promise for fetch instance, to get the instance 
 * @param {Number[]} inputIds The input array of attribute Ids
 * @param {String} attributeName The name of the attribute to be fetched
 * @returns {Promise} Resolved Promise containing the array of attributes fetched, else rejected Promise containing the appropriate error message
 */
function getRoleAttributes(instancePromise, inputIds, attributeName) {

    return instancePromise.then(function(instance) { // fetch the attribute after the instance is returned
            // create find query to check if the input attribute Ids are added to the instance (role/group/user)
            var find = {
                where: {}
            };
            // add the input attribute Ids to where clause of the find query
            find.where[attributeName + 'Id'] = { $in: inputIds};
            
            // create function name from the attribute name
            var functionName = 'get' + attributeName[0].toUpperCase() + attributeName.slice(1) + 's';
            
            // console.log("Find query ----- ", find);
        
            // execute function to fetch attributes with the find query
            return instance[functionName](find);
        })
        .then(function (attribute) {
            // if no attributes are fetched, return empty array
            if (lodash.isEmpty(attribute)) {
                return [];
            } else {
                // if attributes are found, create array of attribute Ids to return from the fetched attributes
                var attr = lodash.map(attribute, lodash.property(attributeName + 'Id'));
                
                // console.log("Added attributes ---- ", attr);
                return attr;
            }
        })
}

/**
 * Checks if the input attribute Ids are valid by comparing it with the possible valid inputs
 * @method checkIfInputIdsCorrect
 * @param {Number[]} inputIds The array of input attribute Ids
 * @param {Number[]} attributeIds The array of valid attribute Ids
 * @param {String} attributeName The attribute name to be passed in case error
 * @param {String} action The action being performed that caused the error
 * @param {String} presentIn The name of the table in which the attribute values are not present in
 * @returns {Promise} The array of valid input attribute Ids or the rejected error message
 */
function checkIfInputIdsCorrect(inputIds, attributeIds, attributeName, action, addedTo, presentIn) {
    var uniqueAttributes;

    // if inputIds are present, remove duplicates
    if (inputIds) {
        uniqueAttributes = lodash.uniq(inputIds);
    }

    // find valid input attributes by finding common ones between array of input Ids and array of valid Ids 
    // var correctInputIds = lodash.intersection(uniqueAttributes, attributeIds);

    // if any input attribute Id is not valid, return error message
    if (attributeIds.length !== uniqueAttributes.length) {
        return Promise.reject(outputFormatter.format(false, 2320, null, attributeName, action, addedTo, presentIn));
    } else { // else return the valid input attributes
        return attributeIds;
    }
}

/**
 * Format the output response using the code and attribute
 * @method formatOutput
 * @param {Number} code The code corresponding to the action performed
 * @param {String} attribute The attribute that was to be changed
 * @returns {Object} The formatted output object
 */
function formatOutput(code, attribute, addedTo) {
    return {
        statusCode: 200,
        content: outputFormatter.format(true, code, null, attribute, addedTo)
    };
}


/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {Object} result The updated Role details to return
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(action, result, done) {
    if (result !== null) {
        switch (action) {
            case 'addUsers':
                done(null, formatOutput(2250, 'User/s', 'Role'));
                break;
            case 'removeUsers':
                done(null, formatOutput(2260, 'User/s', 'Role'));
                break;
            case 'addGroups':
                done(null, formatOutput(2250, 'Group/s', 'Role'));
                break;
            case 'removeGroups':
                done(null, formatOutput(2260, 'Group/s', 'Role'));
                break;
            case 'addPermissions':
                done(null, formatOutput(2250, 'Permission/s', 'Role'));
                break;
            case 'removePermissions':
                done(null, formatOutput(2260, 'Permission/s', 'Role'));
                break;
            case 'addRolesToGroup':
                done(null, formatOutput(2250, 'Role/s', 'Group'));
                break;
            case 'removeRolesFromGroup':
                done(null, formatOutput(2260, 'Role/s', 'Group'));
                break;
            case 'addRolesToUser':
                done(null, formatOutput(2250, 'Role/s', 'User'));
                break;
            case 'removeRolesFromUser':
                done(null, formatOutput(2260, 'Role/s', 'User'));
                break;
            case 'update':
                done(null, {
                    statusCode: 200,
                    content: outputFormatter.format(true, 2050, result, 'Role')
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
        Role = Role || dbConnection.models.roles;
        Permission = Permission || dbConnection.models.permissions;

        var action = null;

        checkInputParameters(args.body)
            .then(function() {
                action = args.body.action;
                delete args.body.action;
                return utils.checkIfAuthorized(args.credentials, false, true);
            })
            .then(function() {
                var teamId = args.credentials.teamId;
                return fetchInstance(action, teamId, args.body);
            })
            .spread(function(instance, validInputs) {

                if (action === 'addUsers') {
                    return [instance, checkIfInputIdsCorrect(args.body.userIds, validInputs, 'users', 'added to', 'role', 'team')];
                } else if (action === 'removeUsers') {
                    return [instance, checkIfInputIdsCorrect(args.body.userIds, validInputs, 'users', 'removed from', 'role', 'role')];
                } else if (action === 'addGroups') {
                    return [instance, checkIfInputIdsCorrect(args.body.groupIds, validInputs, 'groups', 'added to', 'role', 'team')];
                } else if (action === 'removeGroups') {
                    return [instance, checkIfInputIdsCorrect(args.body.groupIds, validInputs, 'groups', 'removed from', 'role', 'role')];
                } else if (action === 'addPermissions') {
                    return [instance, checkIfInputIdsCorrect(args.body.permissionIds, validInputs, 'permissions', 'added to', 'role', 'Permissions list')];
                } else if (action === 'removePermissions') {
                    return [instance, checkIfInputIdsCorrect(args.body.permissionIds, validInputs, 'permissions', 'removed from', 'role', 'role')];
                } else if (action === 'addRolesToGroup') {
                    return [instance, checkIfInputIdsCorrect(args.body.roleIds, validInputs, 'roles', 'added to', 'group', 'team')];
                } else if (action === 'removeRolesFromGroup') {
                    return [instance, checkIfInputIdsCorrect(args.body.roleIds, validInputs, 'roles', 'removed from', 'group', 'group')];
                } else if (action === 'addRolesToUser') {
                    return [instance, checkIfInputIdsCorrect(args.body.roleIds, validInputs, 'roles', 'added to', 'user', 'team')];
                } else if (action === 'removeRolesFromUser') {
                    return [instance, checkIfInputIdsCorrect(args.body.roleIds, validInputs, 'roles', 'removed from', 'user', 'user')];
                } 
            })
            .spread(function(instance, correctInputIds) {
                // console.log("Correct input ids ---- ", correctInputIds);
                switch (action) {
                    case 'addUsers':
                        return instance.addUsers(correctInputIds);
                        break;
                    case 'removeUsers':
                        return instance.removeUsers(correctInputIds);
                        break;
                    case 'addGroups':
                        return instance.addGroups(correctInputIds);
                        break;
                    case 'removeGroups':
                        return instance.removeGroups(correctInputIds);
                        break;
                    case 'addPermissions':
                        return instance.addPermissions(correctInputIds);
                        break;
                    case 'removePermissions':
                        return instance.removePermissions(correctInputIds);
                        break;
                    case 'addRolesToGroup':
                        return instance.addRoles(correctInputIds);
                        break;
                    case 'removeRolesFromGroup':
                        return instance.removeRoles(correctInputIds);
                        break;
                    case 'addRolesToUser':
                        return instance.addRoles(correctInputIds);
                        break;
                    case 'removeRolesFromUser':
                        return instance.removeRoles(correctInputIds);
                        break;
                    case 'update':
                        var updateData = lodash.omitBy(args.body, function (value) {
                            return value === null || value === {};
                        });
                        delete updateData.roleId;
                        return instance.update(args.body);
                        break;
                    default:
                        done(null, {
                            statusCode: 200,
                            content: utils.error(400, "Invalid input. \"action\" is required and must be one of" +
                    "[\"addUsers\", \"removeUsers\", \"addGroups\", \"removeGroups\", \"addPermissions\", " +
                    "\"removePermissions\", \"addRolesToGroup\", \"removeRolesFromGroup\", \"addRolesToUser\", " +
                    "\"removeRolesFromUser\", \"update\"].", microtime.now())
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
                    content: 'success' in err ? err : utils.error(err.id || 400, err.message || err.msg || 'Unexpected error', microtime.now())
                });
            });
    };
};