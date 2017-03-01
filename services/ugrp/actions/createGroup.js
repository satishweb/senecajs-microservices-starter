'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var Promise = require('bluebird');
var microtime = require('microtime');
var Group = null;
var User = null;
var Team = null;

/**
 * @module createGroup
 */

// Joi validation Schema for API call
// User cannot create group named 'user', microservice creates that as default on creating team
var groupSchema = Joi.object().keys({
    name: Joi.string().trim().invalid('Users', 'users').required(),
    description: Joi.string().allow(''),
    userIds: Joi.array().items(Joi.number())
});

// Joi validation schema for microservice call
// Microservice can create 'user' group
var microSchema = Joi.object().keys({
    name: Joi.string().trim().required(),
    description: Joi.string().allow(''),
    userIds: Joi.array().items(Joi.number())
});


/**
 * Create Group from input parameters
 * @method createGroup
 * @param {String} ownerId Id of the organisation owner
 * @param {String} teamId Id of team
 * @param {Object} input input parameters
 * @returns {Promise} Promise containing the created Group details if successful, else containing the appropriate
 * error message
 */
function createGroup(ownerId, teamId, input, teamUsers) {

    // remove input users that are not part of the team
    var userIds = lodash.intersection(input.userIds, teamUsers);
    // console.log("Intersecting user ids ---- ", userIds);
    
    if (userIds.length !== input.userIds.length) {
        return Promise.reject({ id: 400, msg: "Invalid input. One or more users to be added to the group are not present in the team." });
    } else {

        // delete userIds from input
        delete input.userIds;
    
        // create object containing fields to be added to group input object
        var data = {
            ownerId: ownerId,
            teamId: teamId
        };

        // merge the created object and input
        data = lodash.assign(data, input);

        // create new group
        var createPromise = Group.create(data);
        return createPromise.then(function (createdGroup) {
            if (!lodash.isEmpty(userIds)) {
                return createdGroup.addUsers(userIds);
            } else {
                return Promise.resolve(createdGroup);
            }
        })
            .then(function (addedUsers) {
                return createPromise.value();
            })
            .catch(function (err) { // if error, check if error code represents duplicate index on unique field (name)
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
 * Fetch Team Details
 * @method fetchTeamDetails
 * @param {String} teamId Id of the team
 * @returns {Promise} Promise containing the matching team details if successful, else containing the
 * appropriate error message
 */

function fetchTeamDetails(teamId, userIds) {
    return Team.findOne({
        where: { teamId: teamId }, include: {
            model: User, attributes: ['userId'], through: { attributes: [] } } })
        .then(function(team) {
            if (lodash.isEmpty(team)) {
                return Promise.reject({ id: 400, msg: "Invalid teamId. Team not found." });
            } else {
                // console.log("Team fetched ---- ", team.users);
                var teamUsers = lodash.map(team.users, lodash.property('userId'));
                console.log("Team users ---- ", teamUsers);
                return [team, teamUsers];
            }
        })
        .catch(function(err) {
            return Promise.reject({ id: 400, msg: err });
        })
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
    var dbConnection = options.dbConnection;
    return function(args, done) {

        var teamId = null; // stores the team Id
        var groupId = null;
        var finalResponse = null;

        // load database models for Groups and Users
        Group = Group || dbConnection.models.groups;
        User = User || dbConnection.models.users;
        Team = Team || dbConnection.models.teams;

        // if group name is specified in input, convert it to lowercase (for sorting)
        /*if (args.body.name) {
            args.body.name = args.body.name.toLowerCase()
        }*/

        // console.log("DecodedToken ---- ", args.credentials);
        utils.checkInputParameters(args.body, args.credentials.isMicroservice ? microSchema : groupSchema)
            .then(function() {
                return utils.checkIfAuthorized(args.credentials, false, true);
            })
            .then(function() {
                teamId = args.credentials.teamId; // store the team Id for further use
                // console.log("Input parameters verified ----- ", teamId);
                // fetch team details from team Id
                return fetchTeamDetails(teamId);
            })
            .spread(function(team, teamUsers) {
                // create group from input details and team details
                return createGroup(args.credentials.userId, team.teamId, args.body, teamUsers);
            })
            .then(function(response) {
                // send reply
                sendResponse(response, done);
            })
            .catch(function(err) {
                console.log("Error in create Group ---- ", err);

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