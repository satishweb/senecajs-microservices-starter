'use strict';

var utils = require(__base + '/sharedlib/utils');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var Promise = require('bluebird');
var microtime = require('microtime');
var Team = null;

/**
 * @module updateTeam
 */

//Joi validation Schema
//TODO: MOVE
var TeamSchema = Joi.object().keys({
    teamId: Joi.number().required(),
    name: Joi.string(),
    description: Joi.string().allow(''),
    ownerId: Joi.number(),
    website: Joi.string().regex(/^$|^(http\:\/\/|https\:\/\/)?([a-zA-Z0-9][a-z0-9\-]*\.)+[a-zA-Z0-9][a-zA-Z0-9\-]*/).allow('')
});

/**
 * Update Team details
 * @method updateTeam
 * @param {Object} input Input parameters
 * @returns {Promise} Promise containing the created Team details if successful, else containing the appropriate
 * error message
 */
function updateTeam(input, userId) {
    return new Promise(function(resolve, reject) {

        // remove null and empty objects from input and store in separate variable
        var updateData = lodash.omitBy(input, function(value) {
            return value === null || value === {};
        });
        // remove team Id from update object
        delete updateData.teamId;

        // update the team details, find team to update by Id and check if the requesting user is
        // the owner of the team and update with input details
        // returning: true - returns the updated document
        Team.update(updateData, { where: { teamId: input.teamId, ownerId: userId, isDeleted: false }, returning: true, plain: true })
            .then(function(updateResponse) {
                // if no error, check if team is returned
                if (lodash.isEmpty(updateResponse)) { // if no team is returned, return error
                    reject({ id: 400, msg: 'Invalid Team Id or not authorized to update the team.' });
                } else { // if team is returned, transform the object and return it
                    resolve(updateResponse[1].toJSON());
                }
            })
            .catch(function(err) {
                { // for any other error, return the error message
                    reject({ id: 400, msg: 'Invalid Team Id or not authorized to update the team.' });
                }
            });
    });
}

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {Object} result The updated Team details to return
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2050, result, 'Team')
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
 * This is a PUT action for the Teams microservice
 * It checks if the requester is the owner of the team and then updates the team specified by the
 * team Id with the input.
 * @param {Object} options Contains the seneca instance
 */

module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function(args, done) {

        // load the mongoose model for Teams
        Team = Team || dbConnection.models.teams;

        // if input contains field name, convert it to lowercase
        if (args.body.name) {
            args.body.name = args.body.name.toLowerCase();
        }

        // validate input against Joi schema
        utils.checkInputParameters(args.body, TeamSchema)
            .then(function() {
                // check if owner
                return utils.checkIfAuthorized(args.credentials, false, true);
            })
            .then(function() {
                // update team by Id if it belongs to user
                return updateTeam(args.body, args.credentials.userId);
            })
            .then(function(response) {
                sendResponse(response, done);
            })
            .catch(function(err) {

                console.log("Error in update team --- ", err);
                // in case of error, print the error and send as response
                utils.senecaLog(seneca, 'error', __filename.split('/').pop(), err);

                // if the error message is formatted, send it as reply, else format it and then send
                done(null, {
                    statusCode: 200,
                    content: 'success' in err ? err : utils.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};