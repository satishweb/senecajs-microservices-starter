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
    roleId: Joi.number().required(),
    userIds: Joi.array().items(Joi.number().required()).required()
});

//Joi validation Schema for add/remove Groups
var addRemoveGroupsSchema = Joi.object().keys({
    action: Joi.string().valid('addGroups', 'removeGroups').required(),
    roleId: Joi.number().required(),
    groupIds: Joi.array().items(Joi.number().required()).required()
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
            case 'update':
                return utils.checkInputParameters(input, updateRoleSchema);
                break;
            default:
                return Promise.reject({
                    id: 400,
                    msg: "Invalid input. \"action\" is required and must be one of" +
                        "[\"addUsers\", \"removeUsers\", \"addGroups\", \"removeGroups\", \"update\"]"
                });
        }
    } else { // if action is not present in the input return error.
        return Promise.reject({
            id: 400,
            msg: "Invalid input. \"action\" is required and must be one of " +
                "[\"addUsers\", \"removeUsers\", \"addGroups\", \"removeGroups\", \"update\"]"
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
function fetchRole(action, teamId, input) {
    var find = {};

    var rolePromise = null; // for the promise returned by find role
    var teamUsers = null; // for the promise returned by get users belonging to the team
    var teamGroups = null; // for the promise returned by get groups belonging to the team
    var roleGroups = null; // for the promise returned by get groups already added to the role
    var roleUsers = null; // for the promise returned by get users already added to the role

    // create find query for fetching role
    if (input.roleId) { // check if roleId is present and use it to create find query
        find.roleId = input.roleId;
    } else { // if not present, return error message
        return Promise.reject({ id: 400, msg: "Invalid input. \"roleId\" must be present." });
    }

    find.teamId = teamId; // add team Id to find query to enforce that the role must belong to this team only 

    // fetch role by find query created and assign returned promise to variable
    rolePromise = Role.findOne({ where: find })
        .then(function(role) {
            // if no role is found, return error message
            if (lodash.isEmpty(role)) {
                return Promise.reject(outputFormatter.format(false, 1100, null, 'Role'));
            } else {
                return role;
            }
        });

    // if action is addUsers, fetch users belonging to the team to check if users to be added to role are present in the team
    if (action === 'addUsers') {
        // teamUsers = getTeamAttributes(teamId, 'user');
        teamUsers = getValidInputs(teamId, input.userIds, 'user');
    } else if (action === 'addGroups') {
        // if action is addGroups, fetch groups belonging to the team to check if the groups to be added to role belong to team
        // teamGroups = getTeamAttributes(teamId, 'group');
        teamGroups = getValidInputs(teamId, input.groupIds, 'group');
    } else if (action === 'removeUsers') {
        // if action is removeUsers, fetch the users already added to the role to check if users to be removed are present in the role
        roleUsers = getRoleAttributes(rolePromise, input.userIds, 'user');
    } else if (action === 'removeGroups') {
        // if action is removeGroups, fetch the groups already added to the role to check if groups to be removed are present in the role
        roleGroups = getRoleAttributes(rolePromise, input.groupIds, 'group');
    }

    // return when all promises have completed
    return Promise.all([teamUsers, teamGroups, rolePromise, roleUsers, roleGroups]);
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
            attributes: ['teamId'],
            through: { attributes: [] } 
        };
    } else if (attributeName === 'group') { // if attribute is role add the team Id to the where clause of the find query
        model = Group;
        find.where.teamId = teamId;
    } else {
        return Promise.reject({ id: 400, msg: "Incorrect attribute name. Must be one of \"user\" or \"role\"." });
    }

    // find attribute with team Id and return array of valid Ids
    return model.findAll(find)
        .then(function(findResult) {
            // if result is empty, return error message
            if (lodash.isEmpty(findResult)) {
                return [];
            } else {
                // console.log("Find result fetched ---- ", findResult);

                // if find result is not empty, create array of valid Ids to return from the fetched attribute objects
                var validInputs = lodash.map(findResult, lodash.property(attributeName + 'Id'));

                // console.log("Valid inputs ---- ", validInputs);
                return validInputs;
            }
        });
}

/**
 * Fetch the attributes (users or groups) already present in the role, to check if the input attribute values can be removed from the role
 * @method getRoleAttributes
 * @param {Promise} rolePromise The promise for fetch role, to get the role instance 
 * @param {Number[]} inputIds The input array of attribute Ids
 * @param {String} attributeName The name of the attribute to be fetched
 * @returns {Promise} Resolved Promise containing the array of attributes fetched, else rejected Promise containing the appropriate error message
 */
function getRoleAttributes(rolePromise, inputIds, attributeName) {

    return rolePromise.then(function(role) { // fetch the attribute after the role instance is returned
            // create find query to check if the input attribute Ids are added to the role
            var find = {
                where: {}
            };
            // add the input attribute Ids to where clause of the find query
            find.where[attributeName + 'Id'] = { $in: inputIds};
            
            // create function name from the attribute name
            var functionName = 'get' + attributeName[0].toUpperCase() + attributeName.slice(1) + 's';
            
            // console.log("Find query ----- ", find);
        
            // execute function to fetch attributes with the find query
            return role[functionName](find);
        })
        .then(function (attribute) {
            // if no attributes are fetched, return empty array
            if (lodash.isEmpty(attribute)) {
                return [];
            } else {
                // console.log("Group attribute fetched ---- ", attribute);

                // if attributes are found, create array of attribute Ids to return from the fetched attributes
                var roleAttr = lodash.map(attribute, lodash.property(attributeName + 'Id'));
                
                // console.log("Group attributes after map ---- ", groupAttr);
                return roleAttr;
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
    // var correctInputIds = lodash.intersection(uniqueAttributes, attributeIds);

    // if any input attribute Id is not valid, return error message
    if (attributeIds.length !== uniqueAttributes.length) {
        return Promise.reject(outputFormatter.format(false, 2320, null, attributeName, action, 'role', presentIn));
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
function formatOutput(code, attribute) {
    return {
        statusCode: 200,
        content: outputFormatter.format(true, code, null, attribute, 'Role')
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
                done(null, formatOutput(2250, 'User/s'));
                break;
            case 'removeUsers':
                done(null, formatOutput(2260, 'User/s'));
                break;
            case 'addGroups':
                done(null, formatOutput(2250, 'Group/s'));
                break;
            case 'removeGroups':
                done(null, formatOutput(2260, 'Group/s'));
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

        var action = null;

        checkInputParameters(args.body)
            .then(function() {
                action = args.body.action;
                delete args.body.action;
                return utils.checkIfAuthorized(args.credentials, false, true);
            })
            .then(function() {
                var teamId = args.credentials.teamId;
                return fetchRole(action, teamId, args.body);
            })
            .spread(function(teamUsers, teamGroups, role, roleUsers, roleGroups) {

                if (action === 'addUsers') {
                    return [role, checkIfInputIdsCorrect(args.body.userIds, teamUsers, 'users', 'added to', 'team')];
                } else if (action === 'removeUsers') {
                    return [role, checkIfInputIdsCorrect(args.body.userIds, roleUsers, 'users', 'removed from', 'role')];
                } else if (action === 'addGroups') {
                    return [role, checkIfInputIdsCorrect(args.body.groupIds, teamGroups, 'groups', 'added to', 'team')];
                } else if (action === 'removeGroups') {
                    return [role, checkIfInputIdsCorrect(args.body.groupIds, roleGroups, 'groups', 'removed from', 'role')];
                }
            })
            .spread(function(role, correctInputIds) {
                // console.log("Correct input ids ---- ", correctInputIds);
                switch (action) {
                    case 'addUsers':
                        return role.addUsers(correctInputIds);
                        break;
                    case 'removeUsers':
                        return role.removeUsers(correctInputIds);
                        break;
                    case 'addGroups':
                        return role.addGroups(correctInputIds);
                        break;
                    case 'removeGroups':
                        return role.removeGroups(correctInputIds);
                        break;
                    case 'update':
                        var updateData = lodash.omitBy(args.body, function(value) {
                            return value === null || value === {};
                        });
                        delete updateData.roleId;
                        return role.update(args.body);
                    default:
                        done(null, {
                            statusCode: 200,
                            content: utils.error(400, "Invalid input. \"action\" is required and must be one of" +
                        "[\"addUsers\", \"removeUsers\", \"addGroups\", \"removeGroups\", \"update\"]", microtime.now())
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