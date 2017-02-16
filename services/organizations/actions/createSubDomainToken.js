'use strict';

var utils = require(__base + 'sharedlib/utils');
var session = require(__base + 'sharedlib/session.js');
var Locale = require(__base + 'sharedlib/formatter.js');
var outputFormatter = new Locale(__dirname + '/../');
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var Organization = null;
var Session = null;

//Joi validation Schema
var schema = Joi.object().keys({
    orgId: Joi.string().required()
});

/**
 * Fetch organization from organization Id
 * @method fetchOrganization
 * @param {String} orgId organization Id
 * @returns {Promise} Resolved promise containing the fetched organization if successful or rejected promise with appropriate error message in case of error
 */
function fetchOrganization(orgId, userId) {
    return new Promise(function(resolve, reject) {
        Organization.findOne({ where: { orgId: orgId } })
            .then(function(org) {
                if (lodash.isEmpty(org)) {
                    reject({ id: 400, msg: "Invalid organization Id" });
                } else if (org.ownerId == userId){
                    resolve(org)
                } else {
                    reject({id: 400, msg: "Only organization owner can fetch sub domain token."});
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


module.exports = function (options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function (args, done) {
        
        Organization = Organization || dbConnection.models.organizations;
        Session = Session || dbConnection.models.sessions;

        var decodedHeader = null;
        var output = null;
        utils.checkInputParameters(args.body, schema)
            .then(function() {
                decodedHeader = args.credentials;
                return fetchOrganization(args.body.orgId, decodedHeader.userId);
            })
            .then(function(response) {
                output = response;
                var port = args.header.origin.split(":");
                args.header.origin = args.header.origin.split("://")[0] + '://' + response.fqdn;
                if (process.env.SYSENV == 'local') { //check if SYSENV is local
                    args.header.origin = args.header.origin + ':' + port[port.length - 1]; //add port number where project is
                    // deployed
                }
                decodedHeader.origin[args.header.origin] = { orgId: response.orgId, isOwner: true }
                utils.createJWT(decodedHeader, decodedHeader.origin, args.header)
                    .then(function(result) {
                        output.registrationToken = result.output.token;
                        result.sessionData.emailId = result.sessionData.emailId[0];
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