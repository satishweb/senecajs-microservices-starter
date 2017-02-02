'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var session = require(__base + 'sharedlib/session');
var outputFormatter = new Locale(__dirname + '/../');
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
    var seneca = options.seneca;
    var ontology = options.wInstance;
    return function(args, done) {

        Session = Session || ontology.collections.sessions;
        try {
            // delete the users sessions from DB
            session.deleteSessions(Session, args.credentials.userId, args.credentials.orgId, null);
            done(null, {
                statusCode: 200,
                content   : outputFormatter.format(true, 2020)
            });
        } catch (err) {
            done(null, {
                statusCode: 200,
                content   : outputFormatter.format(true, 1000, null, err)
            });
        }
    }
};