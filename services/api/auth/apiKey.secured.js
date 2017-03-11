'use strict';
var Boom = require('boom');
var lodash = require('lodash');
var Promise = require('bluebird');
var url = require('url');
var utils = require(__base + 'sharedlib/utils');
var jwtSecured = require('./jwt.secured');
var ApiKey = null;

/**
 * Function used for authorization before forwarding the request to the API
 * @param {Object} options Object containing seneca instance
 * @returns {{authenticate: authenticate}}
 */

function schema(server, options) {
    jwtSecured = jwtSecured.schema(server, options);
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return {
        authenticate: function(request, reply) {

            ApiKey = ApiKey || dbConnection.models.apikeys;
            // get the token from header or query with key authorization
            var req = request.raw.req;
            var authorization = req.headers.authorization || request.query.authorization;

            // if token is not found send error message
            if (!authorization) {
                return reply(Boom.unauthorized(null, 'Custom'));
            }
            var decodedToken = null;
            utils.verifyTokenAndDecode(authorization)
                .then(function(response) {
                    decodedToken = response;
                    if (decodedToken.isApiKey === true) {
                        return ApiKey.findOne({ where: { apiKey: authorization, teamId: decodedToken.teamId } }) // check if session for the token exists in DB
                            .then(function(response) {
                                if (!lodash.isEmpty(response)) {
                                    if (decodedToken.origin === url.parse(req.headers.origin).hostname) {
                                        seneca.log.info('[ ' + process.env.SRV_NAME + ']', "AUTH INFO : ", 'Valid API token.');
                                        return reply.continue({ credentials: decodedToken });
                                    } else {
                                        return Promise.reject({ id: '501', msg: "APIs can only be accessed from domains registered for API Key." });
                                    }
                                } else {
                                    seneca.log.info('[ ' + process.env.SRV_NAME + ']', "AUTH INFO : ", 'Invalid API token.');
                                    return Promise.reject({ id: '501', msg: "Incorrect API Key." });
                                }
                            })
                    } else {
                        return jwtSecured.authenticate(request, reply);
                    }
                })
                .catch(function(err) {
                    console.log("Error in apiKey.secured ---- ", err);
                    seneca.log.error('[API-GW: AUTH] - ERROR: ', err);
                    return reply(('id' in err && 'msg' in err) ? err : { id: 501, msg: err.errors ? err.errors[0].message : err.message || err });
                });
        }
    };
}

module.exports = {
    schema: schema
};