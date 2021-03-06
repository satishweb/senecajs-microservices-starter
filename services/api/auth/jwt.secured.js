'use strict';
var Boom = require('boom');
var lodash = require('lodash');
var Promise = require('bluebird');
var session = require(__base + 'sharedlib/session.js');
var utils = require(__base + 'sharedlib/utils.js');
var Session = null;

/**
 * Function used for authorization before forwarding the request to the API
 * @param {Object} options Object containing seneca instance
 * @returns {{authenticate: authenticate}}
 */

function schema(server, options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return {
        authenticate: function(request, reply) {

            Session = Session || dbConnection.models.sessions;
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
                    /*if (process.env.SYSENV === 'local') {
                        return Promise.resolve();
                    } else {*/
                        return session.validateSession(response, req.headers); // check if headers match with
                        // decoded token
                    // } 
                })
                .then(function() {
                    return Session.findOne({ where: { JWT: authorization } }); // check if session for the token exists in DB
                })
                .then(function(response) {
                    // if userId in token and DB session matches, continue with call API
                    if (!lodash.isEmpty(response) && decodedToken.userId === response.userId) {
                        seneca.log.info('[ ' + process.env.SRV_NAME + ']', "AUTH INFO : ", 'Valid session.');
                        reply.continue({ credentials: decodedToken });
                    } else {
                        seneca.log.info('[ ' + process.env.SRV_NAME + ']', "AUTH INFO : ", 'Invalid session.');
                        reply({id: '501', msg: "Session does not exist. Please log in."});
                    }
                    return void 0;
                })
                .catch(function(err) {
                    console.log("Error in jwt.secured ---- ", err);
                    seneca.log.error('[API-GW: AUTH] - ERROR: ', err);
                    return reply(('id' in err && 'msg' in err) ? err : {id: 501, msg: err.errors ? err.errors[0].message : err.message || err});
                });
            return void 0;
        }
    };
}

module.exports = {
    schema: schema
};