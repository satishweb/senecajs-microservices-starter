'use strict';

var response = require(__base + '/sharedlib/utils'); //what is response here???
var authentication = require(__base + '/sharedlib/authentication');
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
 * Save invitation details in database
 * @method updateInvitation
 * @param {Object} args Used to get the input parameter
 * @returns {Promise} Promise containing created invitation document if successful, else containing
 * the error message
 */
function updateInvitation(email) {
    return new Promise(function(resolve, reject) {
        Invitation.remove({ email: email }, function(err, findResponse) {
            if (err || lodash.isEmpty(findResponse)) {
                reject({ id: 400, msg: err || 'Invitation not found' });
            } else {
                resolve(findResponse)
            }
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


module.exports = function() {

    return function(args, done) {
        console.log("------------- Delete invitation called ----------", args.body);
        Invitation = Invitation || mongoose.model('Invitations');
        authentication.checkInputParameters(args.body, schema)
            .then(function() {
                return updateInvitation(args.body.email)
            })
            .then(function(response) {
                return sendResponse(response, done);
            })
            .catch(function(err) {
                console.log("Error in delete invitation ----- ", err);
                done(null, {
                    statusCode: 200,
                    content: err.success === true || err.success === false ? err : response.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};