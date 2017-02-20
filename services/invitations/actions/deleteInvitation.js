'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var Invitation = null;

/**
 * @module deleteInvitation
 */

//Joi validation Schema
var schema = Joi.object().keys({
    email: Joi.string().trim().required()
});


/**
 * Delete invitation details in database
 * @method deleteInvitation
 * @param {String} email The email corresponding to the invitation to be deleted
 * @returns {Promise} Promise containing response of remove operation if successful, else containing
 * the error message
 */
function deleteInvitation(email) {
    // remove the invitation corresponding to the email address
    return Invitation.findOne({ where: { email: email } })
        .then(function(invitation) {
            if (lodash.isEmpty(invitation)) {
                return Promise.reject({ id: 400, msg: 'Invitation not found' });
            } else {
                return invitation.destroy();
            }
        });
}


/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {Object} result The final result to be returned, contains the token created
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(done) {
    done(null, {
        statusCode: 200,
        content: outputFormatter.format(true, 2050, null, 'Invitation')
    });
}

/**
 * This is only called by other microservice, not an API
 * It is used to delete the invitation that the user uses to register
 * @param {Object} options Contains the seneca instance
 */
module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function(args, done) {

        // load database model for invitations
        Invitation = Invitation || dbConnection.models.invitations;

        // check if input parameters are according to schema
        utils.checkInputParameters(args.body, schema)
            .then(function() {
                // delete the invitation
                return deleteInvitation(args.body.email)
            })
            .then(function() {
                // send the response if no error occurred
                return sendResponse(done);
            })
            .catch(function(err) {
                console.log("Error in deleteInvitation ---- ", err);

                // in case of error, print the error and send as response
                utils.senecaLog(seneca, 'error', __filename.split('/').pop(), err);

                // if the error message is formatted, send it as reply, else format it and then send
                done(null, {
                    statusCode: 200,
                    content: err.success === true || err.success === false ? err : utils.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};