'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter.js');
var outputFormatter = new Locale(__base);
var lodash = require('lodash');
var jwt = require('jsonwebtoken');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var ApiKey = null;

/**
 * @module deleteApiAccessKey
 */

//Joi validation Schema
var schema = Joi.object().keys({
    apiKey: Joi.string().trim()
});

/**
 * Delete API Access Key for the given team 
 * @method deleteApiKey
 * @param {Object} apiKey The API access key to be deleted
 * @param {Number} teamId The Id of the team for which the token is created
 * @param {Promise} Promise if resolved if API access key is successfully deleted, else promise is rejected
 */
function deleteApiKey(apiKey, teamId) {
    return ApiKey.findOne({ where: { apiKey: apiKey, teamId: teamId } })
        .then(function(apiKeyInstance) {
            if (lodash.isEmpty(apiKeyInstance)) {
                return Promise.reject({ id: 400, msg: "Invalid API Key. API Key not found for your team." });
            }
            return apiKeyInstance.destroy();
        })
}

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(done) {
    done(null, {
        statusCode: 200,
        content: outputFormatter.format(true, 2060, null, 'API Access Key')
    });
}


module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function(args, done) {

        // load database models for team and apiKey
        ApiKey = ApiKey || dbConnection.models.apikeys;

        utils.checkInputParameters(args.body, schema)
            .then(function() {
                return utils.checkIfAuthorized(args.credentials, false, true);
            })
            .then(function() {
                return deleteApiKey(args.body.apiKey, args.credentials.teamId)
            })
            .then(function() {
                sendResponse(done);
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