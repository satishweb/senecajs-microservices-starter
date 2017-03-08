'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var Promise = require('bluebird');
var microtime = require('microtime');
var Team = null;

/**
 * @module deleteTeam
 */

//Joi validation Schema
var TeamSchema = Joi.object().keys({
    teamId: Joi.number().required()
});

/**
 * Soft delete the team by updating isDeleted to true
 * @method deleteTeam
 * @param {String} teamId Team Id of the team to delete
 ** @param {String} ownerId User Id of the user
 * @returns {Promise} Promise containing the response Team details if successful, else containing the
 * appropriate error message
 */
function deleteTeam(ownerId, teamId) {
    return new Promise(function(resolve, reject) {

        // update the team to isDeleted true by the teamId and return the updated document
        Team.update({ 'isDeleted': true }, { where: { teamId: teamId, ownerId: ownerId, isDeleted: false }, returning: true, plain: true })
            .then(function (updateResponse) {
                if (lodash.isEmpty(updateResponse[1])) {  // if error or empty, reject with the error message
                    reject({ id: 400, msg: "Invalid team Id or not authorized to delete team." });
                } else {
                    resolve();
                }
            })
            .catch(function (err) {
                reject({ id: 400, msg: "Invalid team Id or not authorized to delete team." });
            })
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
            content: outputFormatter.format(true, 2060, null, 'Team')
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
 * This is a DELETE action for the Teams microservice
 * It soft deletes an team by the team Id.
 * @param {Object} options Contains the seneca instance
 */

module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function(args, done) {
        
        // load the mongoose model for team
        Team = Team || dbConnection.models.teams;

        // validate input against Joi schema
        utils.checkInputParameters(args.body, TeamSchema)
            .then(function() {
                // check if owner
                return utils.checkIfAuthorized(args.credentials, false, true);
            })
            .then(function() {
                // soft delete the team
                return deleteTeam(args.credentials.userId, args.body.teamId);
            })
            .then(function(response) {
                sendResponse(response, done);
            })
            .catch(function (err) {
                console.log("error in delete team ----- ", err);
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