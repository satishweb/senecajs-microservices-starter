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

//Joi validation Schema for add/remove Users
var addRemoveUsersSchema = Joi.object().keys({
    action: Joi.string().valid('addUsers', 'removeUsers').required(),
    groupId: Joi.number(),
    groupName: Joi.string(),
    userIds: Joi.array().items(Joi.number().required()).required()
}).xor('groupId', 'groupName'); // should have either groupId or groupName, not both

//Joi validation Schema for add/remove Roles
var addRemoveRolesSchema = Joi.object().keys({
    action: Joi.string().valid('addRoles', 'removeRoles').required(),
    groupId: Joi.number(),
    groupName: Joi.string(),
    roleIds: Joi.array().items(Joi.number().required()).required()
}).xor('groupId', 'groupName'); // should have either groupId or groupName, not both

//Joi validation Schema for update group details
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
            case 'addRoles':
            case 'removeRoles':
                return utils.checkInputParameters(input, addRemoveRolesSchema);
                break;
            case 'update':
                return utils.checkInputParameters(input, updateGroupSchema);
                break;
            default:
                return Promise.reject({
                    id: 400,
                    msg: "Invalid input. \"action\" is required and must be one of" +
                        "[\"addUsers\", \"removeUsers\", \"addRoles\", \"removeRoles\", \"update\"]"
                });
        }
    } else { // if action is not present in the input return error.
        return Promise.reject({
            id: 400,
            msg: "Invalid input. \"action\" is required and must be one of " +
                "[\"addUsers\", \"removeUsers\", \"addRoles\", \"removeRoles\", \"update\"]"
        });
    }
}

/**
 * Fetch group instance to update, add users or remove users. For add users/roles, also fetch users/roles belonging to the team to check if input users/roles belong to the team.
 * Similarly, for remove users/roles fetch the users/roles already added to the group to check if the input users/roles belong to the group.
 * @method fetchGroup
 * @param {Number} teamId The team Id decoded from the JWT token
 * @param {Number} groupId Group Id of the group to fetch
 * @param {String} groupName Group Name of the group to fetch
 * @param {Boolean} isMicroservice Whether the caller is a microservice 
 * @returns {Promise} Resolved promise containing the fetched group if successful, else rejected promise with the appropriate error message
 */
function fetchGroup(action, teamId, groupId, groupName, isMicroservice) {
    var find = {};

    var groupPromise = null; // for the promise returned by find group
    var teamUsers = null; // for the promise returned by get users belonging to the team
    var teamRoles = null; // for the promise returned by get roles belonging to the team
    var groupRoles = null; // for the promise returned by get roles already added to the group
    var groupUsers = null; // for the promise returned by get users already added to the group

    // create find query for fetching group
    if (groupId) { // if groupId is present, use it to create find query
        find.groupId = groupId;
    } else if (groupName) { // else if groupName is present, use it to create find query 
        find.groupName = groupName;
    } else { // if neither is present, return error message
        return Promise.reject({ id: 400, msg: "Invalid input. One of \"groupName\" or \"groupId\" must be present." });
    }

    find.teamId = teamId; // add team Id to find query to enforce that the group must belong to this team only 

    // fetch group by find query created and assign returned promise to variable
    groupPromise = Group.findOne({ where: find })
        .then(function(group) {
            // if no group is found, return error message
            if (lodash.isEmpty(group)) {
                return Promise.reject(outputFormatter.format(false, 1100, null, 'Group'));
            } else if (!isMicroservice && action === 'update' && (group.name.toLowerCase() === 'users' || group.name.toLowerCase() === 'admins')) {
                // if group being updated is default group and request is not from a microservice, return error message
                return Promise.reject({ id: 400, msg: "Cannot update default groups." })
            } else {
                return group;
            }
        });

    // if action is addUsers, fetch users belonging to the team to check if users to be added to group are present in the team
    if (action === 'addUsers') {
        teamUsers = getTeamAttributes(teamId, 'user');
    } else if (action === 'addRoles') {
        // if action is addRoles, fetch roles belonging to the team to check if the roles to be added to group belong to team
        teamRoles = getTeamAttributes(teamId, 'role');
    } else if (action === 'removeUsers') {
        // if action is removeUsers, fetch the users already added to the group to check if users to be removed are present in the group
        groupUsers = getGroupAttributes(groupPromise, 'user');
    } else if (action === 'removeRoles') {
        // if action is removeRoles, fetch the roles already added to the group to check if roles to be removed are present in the group
        groupRoles = getGroupAttributes(groupPromise, 'role');
    }

    // return when all promises have completed
    return Promise.all([teamUsers, teamRoles, groupPromise, groupUsers, groupRoles]);
}

/**
 * Fetch attributes (users or roles) belonging to the team to check if the input attribute values are valid
 * @method getTeamAttributes
 * @param {Number} teamId The Id of the team
 * @param {String} attributeName Name of the attribute to be fetched
 * @returns {Promise} Resolved Promise containing the array of attributes fetched, else rejected Promise containing the appropriate error message
 */
function getTeamAttributes(teamId, attributeName) {

    // create find query for team using Id of the team and to include the attribute
    var find = {
        where: { teamId: teamId },
        include: {
            attributes: [attributeName + 'Id'],
        }
    };

    // if attribute is user, add the user model to the include part of the find query
    if (attributeName === 'user') {
        find.include.model = User;
        find.include.through = { attributes: [] };
    } else if (attributeName === 'role') { // if attribute is role add the role model to the include part of the find query
        find.include.model = Role;
    } else {
        return Promise.reject({ id: 400, msg: "Incorrect attribute name. Must be one of \"user\" or \"role\"." });
    }

    // find team with attributes and return array of attribute Ids
    return Team.findOne(find)
        .then(function(team) {
            // if team is not found, return error message
            if (lodash.isEmpty(team)) {
                return Promise.reject(outputFormatter.format(false, 1100, null, 'Team'));
            } else {
                // console.log("Team fetched ---- ", team[attributeName + 's']);

                // if team is found, create array of attribute Ids to return from the fetched team object
                var attribute = lodash.map(team[attributeName + 's'], lodash.property(attributeName + 'Id'));

                // console.log("Team users/groups ---- ", attribute);
                return attribute;
            }
        });
}

/**
 * Fetch the attributes (users or roles) already present in the group, to check if the input attribute values can be removed from the group
 * @method getGroupAttributes
 * @param {Promise} groupPromise The promise for fetch group, to get the group instance 
 * @param {String} attributeName The name of the attribute to be fetched
 * @returns {Promise} Resolved Promise containing the array of attributes fetched, else rejected Promise containing the appropriate error message
 */
function getGroupAttributes(groupPromise, attributeName) {

    return groupPromise.then(function(group) { // fetch the attribute after the group instance is returned
            // console.log("Group fetched ---- ", group);

            // create function name from the attribute name
            var functionName = 'get' + attributeName[0].toUpperCase() + attributeName.slice(1) + 's';
            // console.log("Function Name ----- ", functionName);
        
            // execute function to fetch attributes
            return group[functionName]();
        })
        .then(function (attribute) {
            // if no attributes are fetched, return empty array
            if (lodash.isEmpty(attribute)) {
                return [];
            } else {
                // console.log("Group attribute fetched ---- ", attribute);

                // if attributes are found, create array of attribute Ids to return from the fetched attributes
                var groupAttr = lodash.map(attribute, lodash.property(attributeName + 'Id'));
                
                // console.log("Group attributes after map ---- ", groupAttr);
                return groupAttr;
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
function checkIfInputIdsCorrect(inputIds, attributeIds, attributeName, action, presentIn) {
    var uniqueAttributes;

    // if inputIds are present, remove duplicates
    if (inputIds) {
        uniqueAttributes = lodash.uniq(inputIds);
    }

    // find valid input attributes by finding common ones between array of input Ids and array of valid Ids 
    var correctInputIds = lodash.intersection(uniqueAttributes, attributeIds);

    // if any input attribute Id is not valid, return error message
    if (correctInputIds.length !== uniqueAttributes.length) {
        return Promise.reject(outputFormatter.format(false, 2320, null, attributeName, action, 'group', presentIn));
    } else { // else return the valid input attributes
        return correctInputIds;
    }
}

/**
 * Format the output response using the code and attribute
 * @method formatOutput
 * @param {Number} code The code corresponding to the action performed
 * @param {String} attribute The attribute that was to be changed
 * @returns {Object} The formatted output object
 */
function formatOutput(code, attribute) {
    return {
        statusCode: 200,
        content: outputFormatter.format(true, code, null, attribute, 'Group')
    };
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
                done(null, formatOutput(2250, 'User/s'));
                break;
            case 'removeUsers':
                done(null, formatOutput(2260, 'User/s'));
                break;
            case 'addRoles':
                done(null, formatOutput(2250, 'Role/s'));
                break;
            case 'removeRoles':
                done(null, formatOutput(2260, 'Role/s'));
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
        Role = Role || dbConnection.models.roles;

        var RoleId = null;
        var action = null;
        var isMicroservice = false;

        checkInputParameters(args.body)
            .then(function() {
                action = args.body.action;
                delete args.body.action;
                return utils.checkIfAuthorized(args.credentials, false, true);
            })
            .then(function() {
                var teamId = args.credentials.teamId;
                var isMicroservice = args.credentials.isMicroservice;
                return fetchGroup(action, teamId, args.body.groupId, args.body.groupName, isMicroservice);
            })
            .spread(function(teamUsers, teamRoles, group, groupUsers, groupRoles) {

                if (action === 'addUsers') {
                    return [group, checkIfInputIdsCorrect(args.body.userIds, teamUsers, 'users', 'added to', 'team')];
                } else if (action === 'removeUsers') {
                    return [group, checkIfInputIdsCorrect(args.body.userIds, groupUsers, 'users', 'removed from', 'group')];
                } else if (action === 'addRoles') {
                    return [group, checkIfInputIdsCorrect(args.body.roleIds, teamRoles, 'roles', 'added to', 'team')];
                } else if (action === 'removeRoles') {
                    return [group, checkIfInputIdsCorrect(args.body.roleIds, groupRoles, 'roles', 'removed from', 'group')];
                }
            })
            .spread(function(group, correctInputIds) {
                // console.log("Correct input ids ---- ", correctInputIds);
                switch (action) {
                    case 'addUsers':
                        return group.addUsers(correctInputIds);
                        break;
                    case 'removeUsers':
                        return group.removeUsers(correctInputIds);
                        break;
                    case 'addRoles':
                        return group.addRoles(correctInputIds);
                        break;
                    case 'removeRoles':
                        return group.removeRoles(correctInputIds);
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
                    content: 'success' in err ? err : utils.error(err.id || 400, err.message || err.msg || 'Unexpected error', microtime.now())
                });
            });
    };
};