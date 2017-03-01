'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter.js');
var outputFormatter = new Locale(__base);
var lodash = require('lodash');
var jwt = require('jsonwebtoken');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var Team = null;
var ApiKey = null;

/**
 * @module createApiAccessKey
 */

//Joi validation Schema
var schema = Joi.object().keys({
    origin: Joi.string().trim().required(),
    apiKey: Joi.string().trim()
});

/**
 * Create API Access Key for the given team 
 * @method createApiKey
 * @param {Object} input The input object
 * @param {Number} teamId The Id of the team for which the token is created
 * @returns {String} The created JWT token
 */
function createApiKey(input, teamId) {
    var apiKey = jwt.sign({ origin: input.origin, teamId: teamId, isApiKey: true }, process.env.JWT_SECRET_KEY); // create the JWT token
    if (input.apiKey) {
        return ApiKey.update({ apiKey: apiKey, origin: input.origin }, { where: { apiKey: input.apiKey, teamId: teamId } })
            .then(function(updatedApiKey) {
                if (updatedApiKey[0] === 0) {
                    return Promise.reject({ id: 400, msg: "Update failed. Input API Key not found for your team." });
                } else {
                    return updatedApiKey;
                }
            })
    } else if (input.origin) {
        return Team.findOne({ where: { teamId: teamId } })
            .then(function(team) {
                if (lodash.isEmpty(team)) {
                    return Promise.reject({ id: 400, msg: "Team not found." });
                } else {
                    return team.createApikey({ origin: input.origin, apiKey: apiKey });
                }
            })
    } 
}

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {String} result The final result to be returned, contains the token created
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2030, result, 'API Access Key')
        });
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

        // load database models for team and apiKey
        Team = Team || dbConnection.models.teams;
        ApiKey = ApiKey || dbConnection.models.apikeys;

        utils.checkInputParameters(args.body, schema)
            .then(function() {
                return utils.checkIfAuthorized(args.credentials, false, true);
            })
            .then(function() {
                return createApiKey(args.body, args.credentials.teamId)
            })
            .then(function (response) {
                console.log("Response of create or update ---- ", response);
                sendResponse(response, done);
            })
            .catch(function(err) {
                console.log('err in create api key --- ', err);

                // in case of error, print the error
                utils.senecaLog(seneca, 'error', __filename.split('/').pop(), err);

                // if the error message is formatted, send it as reply, else format it and then send
                done(null, {
                    statusCode: 200,
                    content: 'success' in err ? err : utils.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};