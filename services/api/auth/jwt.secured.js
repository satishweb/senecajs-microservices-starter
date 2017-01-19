'use strict';
var util = require('util');
var Boom = require('boom');
var lodash = require('lodash');
var session = require(__base + 'sharedlib/session.js');
var authentication = require(__base + 'sharedlib/authentication.js');

/**
 * Function used for authorization before forwarding the request to the API
 * @param {Object} server The server object
 * @param {Object} options Object containing seneca instance
 * @returns {{authenticate: authenticate}}
 */

function schema(server, options) {
    var seneca = options.seneca;
    return {
        authenticate: function(request, reply) {

            // get the token from header or query with key authorization
            var req = request.raw.req;
            var authorization = req.headers.authorization || request.query.authorization;

            // if token is not found send error message
            if (!authorization) {
                return reply(Boom.unauthorized(null, 'Custom'));
            }
            var decodedToken = null;
            authentication.verifyTokenAndDecode(authorization)
                .then(function(response) {
                    decodedToken = response;
                    return session.validateSession(response, req.headers); // check if headers match with decoded token
                })
                .then(function() {
                    return session.getSession(authorization); // check if session for the token exists in DB
                })
                .then(function(response) {
                    // if userId in token and DB session matches, continue with call API
                    if (!lodash.isEmpty(response) && decodedToken.userId === response.sessionData.userId) {
                        seneca.log.info('[ ' + process.env.SRV_NAME + ']', "AUTH INFO : ", 'Valid session.');
                        reply.continue({ credentials: decodedToken });
                    } else {
                        seneca.log.info('[ ' + process.env.SRV_NAME + ']', "AUTH INFO : ", 'Invalid session.');
                        reply(Boom.unauthorized(null, 'Custom'));
                    }
                    return void 0;
                })
                .catch(function(err) {
                    seneca.log.error('[API-GW: AUTH] - ERROR: ', err);
                    return reply(err);
                });
            return void 0;
        }
    };
}

module.exports = {
    schema: schema
};