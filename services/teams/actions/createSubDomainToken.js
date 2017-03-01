'use strict';

var utils = require(__base + 'sharedlib/utils');
var session = require(__base + 'sharedlib/session.js');
var Locale = require(__base + 'sharedlib/formatter.js');
var outputFormatter = new Locale(__dirname + '/../');
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var Team = null;
var Session = null;

//Joi validation Schema
var schema = Joi.object().keys({
    teamId: Joi.string().required()
});

/**
 * Fetch team from team Id
 * @method fetchTeam
 * @param {String} teamId team Id
 * @returns {Promise} Resolved promise containing the fetched team if successful or rejected promise with appropriate error message in case of error
 */
function fetchTeam(teamId, userId) {
    return new Promise(function(resolve, reject) {
        Team.findOne({ where: { teamId: teamId } })
            .then(function(org) {
                if (lodash.isEmpty(org)) {
                    reject({ id: 400, msg: "Invalid team Id" });
                } else if (org.ownerId == userId) {
                    resolve(org)
                } else {
                    reject({ id: 400, msg: "Only team owner can fetch sub domain token." });
                }
            })
            .catch(function(err) {
                reject({ id: 400, msg: err });
            })
    });
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
            content: outputFormatter.format(true, 2030, result, 'Access Token')
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
        Session = Session || dbConnection.models.sessions;

        var decodedHeader = null;
        var output = null;
        utils.checkInputParameters(args.body, schema)
            .then(function() {
                decodedHeader = args.credentials;
                return fetchTeam(args.body.teamId, decodedHeader.userId);
            })
            .then(function (response) {
                output = response.toJSON();
                decodedHeader.origin[response.fqdn] = { teamId: response.teamId, isOwner: true };
                decodedHeader.emails = decodedHeader.emailId;
                utils.createJWT(decodedHeader, args.header)
                    .then(function(result) {
                        console.log("Result of create token ---- ", result);
                        output.registrationToken = result.output.token;
                        result.sessionData.emailId = result.sessionData.emailId[0];
                        console.log("Output ---- ", output, result.output.token);
                        return session.createSession(Session, result.output.token, result.sessionData);
                    })
                    .then(function() {
                        return sendResponse(output, done);
                    })
                    .catch(function(err) {
                        console.log('err in create token---- ', err);
                        done(null, {
                            statusCode: 200,
                            content: err.success === true || err.success === false ? err : utils.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                        });
                    })
            })
            .catch(function(err) {
                console.log('err in create sub-domain token--- ', err);
                done(null, {
                    statusCode: 200,
                    content: err.success === true || err.success === false ? err : utils.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};