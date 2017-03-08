'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter.js');
var outputFormatter = new Locale(__base);
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var Team = null;
var AWS = require('aws-sdk');

/**
 * @module checkSubDomain
 */

//Joi validation Schema
var schema = Joi.object().keys({
    teamId: Joi.string(),
    subDomain: Joi.string()
}).xor('teamId', 'subDomain');

/**
 * Fetch team details by team Id
 * @method fetchTeam
 * @param {String} input Contains the input parameters
 * @returns {Promise} Promise containing team details if successful, else containing the error message
 */
function fetchTeam(input) {
    return new Promise(function(resolve, reject) {
        var find = { where: {} };
        if (input.teamId) {
            find.where.teamId = input.teamId;
        } else if (input.subDomain) {
            find.where.subDomain = input.subDomain;
        }
        Team.findOne(find)
            .then(function(findResult) {
                if (lodash.isEmpty(findResult)) {
                    reject({ id: 400, msg: 'Team not found' });
                } else {
                    resolve(findResult);
                }
            })
            .catch(function(err) {
                reject({ id: 400, msg: err })
            })
    })
}

/**
 * @method updateTeam
 * @param {String} teamId team Id
 * @param {Object} update data to be updated
 */
function updateTeam(org, update) {
    org.update(update)
        .then(function(updateResponse) {})
        .catch(function(err) {
            if (err) {
                console.log("error updating team status", err);
            }
        })
}

/**
 * Check the status of Resource Record on Amazon Route53
 * @method checkResourceRecordSetStatus
 * @param {Object} orgDetails team details fetched
 */
function checkResourceRecordSetStatus(orgDetails) {
    return new Promise(function(resolve, reject) {
        var route53 = new AWS.Route53();
        //check if route53 Id is present in database
        if (orgDetails.route53Status === 'PENDING') {
            var param = {
                Id: orgDetails.route53Id
            };

            route53.getChange(param, function(err, data) {
                if (err) {
                    reject({ id: 400, msg: err.message });
                } else {
                    updateTeam(orgDetails, { 'route53Status': data.ChangeInfo.Status });
                    if (data.ChangeInfo.Status == 'INSYNC') {
                        resolve({ isUpdated: true })
                    } else {
                        resolve({ isUpdated: false })
                    }
                }
            });
        } else {
            resolve({ isUpdated: true })
        }
    })
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
            content: outputFormatter.format(true, 2000, result, 'Team Deployment Status')
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
        Team = Team || dbConnection.models.teams;
        AWS.config.update({
            accessKeyId: process.env.R53_ACCESS_ID,
            secretAccessKey: process.env.R53_SECRET_KEY,
            region: process.env.R53_REGION
        });
        var orgDetails = null;
        utils.checkInputParameters(args.body, schema)
            .then(function() {
                return utils.checkIfAuthorized(args.credentials, false, false);
            })
            .then(function() {
                return fetchTeam(args.body);
            })
            .then(function (response) {
                console.log("Response of fetchTeam --- ", response);
                orgDetails = response;
                return checkResourceRecordSetStatus(response);
            })
            .then(function (response) {
                response = Object.assign(response, orgDetails.toJSON());
                sendResponse(response, done);
            })
            .catch(function(err) {
                console.log("Error in checkStatus ---- ", err);
                // in case of error, print the error
                utils.senecaLog(seneca, 'error', __filename.split('/').pop(), err);

                // if the error message is formatted, send it as reply, else format it and then send
                done(null, {
                    statusCode: 200,
                    content: err.success === true || err.success === false ? err : utils.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};