'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var Promise = require('bluebird');
var microtime = require('microtime');
var Role = null;
var User = null;
var Group = null;
var Team = null;

/**
 * @module createRole
 */

// Joi validation schema
var roleSchema = Joi.object().keys({
    name: Joi.string().trim().required(),
    description: Joi.string().allow(''),
    userIds: Joi.array().items(Joi.number()),
    groupIds: Joi.array().items(Joi.number())
});

/**
 * Fetch Team Details
 * @method fetchTeamDetails
 * @param {String} teamId Id of the team
 * @param {Object} input The input object
 * @returns {Promise} Promise containing the matching team details if successful, else containing the
 * appropriate error message
 */

function fetchTeamDetails(teamId, input) {

    var find = {
        where: { teamId: teamId }
    };
    if (input.userIds) {
        if (!find.include) {
            find.include = [];
        }
        find.include.push({
            model: User,
            attributes: ['userId'],
            through: { attributes: [] }
        });
    }
    if (input.groupIds) {
        if (!find.include) {
            find.include = [];
        }
        find.include.push({
            model: Group,
            attributes: ['groupId']
        });
    }

    // console.log("Find --- ", find, Team, Group, User);   

    return Team.findOne(find)
        .then(function(team) {
            if (lodash.isEmpty(team)) {
                return Promise.reject({ id: 400, msg: "Invalid teamId. Team not found." });
            } else {
                // console.log("Team fetched ---- ", team.users);
                if (team.users) {
                    var teamUsers = lodash.map(team.users, lodash.property('userId'));
                }
                if (team.groups) {
                    var teamGroups = lodash.map(team.groups, lodash.property('groupId'));
                }
                // console.log("Team users ---- ", teamUsers);
                // console.log("Team groups ---- ", teamGroups);
                return [team, teamUsers, teamGroups];
            }
        })
        .catch(function(err) {
            return Promise.reject({ id: 400, msg: err });
        })
}


/**
 * Create Role from input parameters
 * @method createRole
 * @param {String} ownerId Id of the organization owner
 * @param {String} teamId Id of team
 * @param {Object} input Input parameters
 * @param {Number[]} teamUsers The array of users present in the team
 * @param {Number[]} teamGroups The array of groups created for the team
 * @returns {Promise} Promise containing the created Role details if successful, else containing the appropriate
 * error message
 */
function createRole(ownerId, teamId, input, teamUsers, teamGroups) {

    if (input.userIds) {
        // remove duplicate user Ids if present in input
        input.userIds = lodash.uniq(input.userIds);
        // remove input users that are not part of the team
        var userIds = lodash.intersection(input.userIds, teamUsers);
        // console.log("Intersecting user ids ---- ", userIds);
    }
    if (input.groupIds) {
        // remove duplicate group Ids if present in input
        input.groupIds = lodash.uniq(input.groupIds);
        // remove input groups that are not part of the team
        var groupIds = lodash.intersection(input.groupIds, teamGroups);
        // console.log("Intersecting group ids ---- ", groupIds);
    }

    if (userIds && userIds.length !== input.userIds.length) {
        return Promise.reject({ id: 400, msg: "Invalid input. One or more users to be added to the role are not present in the team." });
    } else if (groupIds && groupIds.length !== input.groupIds.length) {
        return Promise.reject({ id: 400, msg: "Invalid input. One or more groups to be added to the role are not present in the team." });
    } else {

        // create object containing fields to be added to role input object
        var data = {
            ownerId: ownerId,
            teamId: teamId
        };

        delete input.groupIds;
        delete input.userIds

        // merge the created object and input
        data = lodash.assign(data, input);

        // create new role
        var createPromise = Role.create(data);
        return createPromise
            .then(function(createdRole) {
                if (!lodash.isEmpty(userIds)) {
                    return createdRole.addUsers(userIds);
                } else {
                    return Promise.resolve();
                }
            })
            .then(function () {
                var createdRole = createPromise.value();
                if (!lodash.isEmpty(groupIds)) {
                    return createdRole.addGroups(groupIds);
                } else {
                    return Promise.resolve();
                }
            })
            .then(function() {
                return createPromise.value();
            })
            .catch(function(err) { // if error, check if error code represents duplicate index on unique field (name)
                // console.log("Error in create group ---- ", err);
                if (err.parent && err.parent.code == 23505) { // check if duplicate name is used to create a new group
                    return Promise.reject({ id: 400, msg: "Group name already exists for this team." });
                } else { // in case of other errors, reject received error
                    return Promise.reject({ id: 400, msg: err.message });
                }
            })
    }
}

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {Object} result The updated Role details to return
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2030, result, 'Role')
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
    var dbConnection = options.dbConnection;
    return function(args, done) {

        var teamId = null; // stores the team Id
        var groupId = null;

        // load database models for Groups and Users
        Group = Group || dbConnection.models.groups;
        User = User || dbConnection.models.users;
        Role = Role || dbConnection.models.roles;
        Team = Team || dbConnection.models.teams;

        utils.checkInputParameters(args.body, roleSchema)
            .then(function() {
                return utils.checkIfAuthorized(args.credentials, false, true);
            })
            .then(function() {
                teamId = args.credentials.teamId; // store the team Id for further use
                // console.log("Input parameters verified ----- ", teamId);
                // fetch team details from team Id
                return fetchTeamDetails(teamId, args.body);
            })
            .spread(function (team, teamUsers, teamGroups) {
                // console.log("Fetched team ----- ", team, teamUsers, teamGroups);
                teamId = args.credentials.teamId;
                // create role from input details
                return createRole(args.credentials.userId, teamId, args.body, teamUsers, teamGroups);
            })
            .then(function(response) {
                // send reply
                sendResponse(response, done);
            })
            .catch(function(err) {
                console.log("Error in create Role ---- ", err);

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