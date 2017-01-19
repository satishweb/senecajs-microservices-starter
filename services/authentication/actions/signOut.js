'use strict';

var utils = require(__base + 'sharedlib/utils');
var authentication = require(__base + 'sharedlib/authentication');
var Locale = require(__base + 'sharedlib/formatter');
var session = require(__base + 'sharedlib/session');
var outputFormatter = new Locale(__dirname + '/../');
var Promise = require('bluebird');
var mongoose = require('mongoose');
var microtime = require('microtime');
var Session = null;

/**
 * @module signOut
 */


/**
 * Used to Log out user.
 * The token is invalidated automatically when the timestamp of the token expires.
 * @param {Object} options  Variables needed for database connection and microservices related details
 */
module.exports = function(options) {
    return function(args, done) {

        Session = Session || mongoose.model('Sessions');

        utils.verifyTokenAndDecode(args)
            .then(function(response) {
                // delete the users sessions from DB
                session.deleteSessions(Session, response.userId, response.orgId, null);
                done(null, {
                    statusCode: 200,
                    content: outputFormatter.format(true, 2020)
                });
            })
            .catch(function(err) {
                seneca.log.error('[ ' + process.env.SRV_NAME + ': ' + __filename.split('/').slice(-1) + ' ]', "ERROR" +
                  " : ", err);
                var error = err || { id: 400, msg: "Unexpected error" };
                done(null, {
                    statusCode: 200,
                    content: utils.error(error.id, error.msg, microtime.now())
                });
            });
    };
};