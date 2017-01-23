'use strict';

var utils = require(__base + '/sharedlib/utils');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__dirname + '/../');
var lodash = require('lodash');
var Joi = require('joi');
var mongoose = require('mongoose');
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
    return new Promise(function(resolve, reject) {
        
        // remove the invitation corresponding to the email address
        Invitation.remove({ email: email }, function(err, removeResponse) {
            if (err || removeResponse.n < 1) {
                reject({ id: 400, msg: err || 'Invitation not found' });
            } else {
                resolve(removeResponse)
            }
        })
    });
}


/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {Object} result The final result to be returned, contains the token created
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2050, result, 'Invitation')
        });
    } else {
        //else return error
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
}

/**
 * This is only called by other microservice, not an API
 * It is used to delete the invitation that the user uses to register
 * @param {Object} options Contains the seneca instance
 */
module.exports = function(options) {
    var seneca = options.seneca;
    return function(args, done) {
        
        // load mongoose model for invitations
        Invitation = Invitation || mongoose.model('Invitations');
        
        // check if input parameters are according to schema
        utils.checkInputParameters(args.body, schema)
            .then(function() {
                // delete the invitation
                return deleteInvitation(args.body.email)
            })
            .then(function(response) {
                // send the response if no error occurred
                return sendResponse(response, done);
            })
            .catch(function(err) {
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