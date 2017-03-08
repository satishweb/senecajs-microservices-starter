'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var lodash = require('lodash');
var Promise = require('bluebird');
var microtime = require('microtime');
var Invitation = null;
var User = null;
var Email = null;
var Team = null;

/**
 * @module validateInvitation
 */

/**
 * Check if the invitation is pending in database or has already been used
 * @method checkInDB
 * @param {String} token The input token
 * @param {Object} decodedToken The decoded token to get the email Id and the team Id
 * @returns {Promise} Promise containing fetched invitation document if successful, else containing the error message
 */
function checkInDB(token, decodedToken) {
    // fetch invitation matching the email Id, team Id and token
    return Invitation.findOne({ where: { email: decodedToken.email, teamId: decodedToken.teamId, token: token } })
        .then(function(findResponse) {
            // if no document is found return message for invitation used
            if (lodash.isEmpty(findResponse)) {
                return Promise.reject({
                    id: 400,
                    msg: 'Invalid invitation or already used. Please ask admin to send invitation' +
                        ' again if not registered yet.'
                });
            } else {
                return Promise.resolve(findResponse);
            }
        })
}

/**
 * Check if the user exists
 * @method fetchUser
 * @param {Object} email The email to fetch the user
 * @param {Object} header The microservice header
 * @param {Seneca} seneca Seneca instance
 * @returns {Promise} Promise containing fetched invitation document if successful, else containing the error message
 */
function fetchUser(email, header, seneca) {
    // fetch user matching the email Id
    // return utils.microServiceCallPromise(seneca, 'ugrp', 'getUsers', { action: 'list', filter: { email: [email] } }, header, true);
    return User.findOne({ include: [{ model: Email, as: 'emails', where: { email: email } }] });
}


/**
 * Add the user to the team
 * @method addUserToTeam
 * @param {Object} user The user instance returned by find
 * @param {Object} invitation The invitation instance returned by find
 * @param {Number} decodedToken The decoded token containing the org Id and the email
 * @param {Number} header The input header to be forwarded to forgotPassword
 * @param {Number} seneca The seneca instance for microservice call
 * @returns {Promise} Promise containing fetched invitation document if successful, else containing the error message
 */
function addUserToTeam(user, invitation, decodedToken, header, seneca) {
    if (lodash.isEmpty(user)) {
        return callForgotPassword(decodedToken, header, seneca)
            .then(function(response) {
                return response.content.data;
            })
    } else {
        // if user is already present, add him to the team
        return user.addTeam(decodedToken.teamId)
            .then(function(updateResponse) {
                console.log("Update response ---- ", updateResponse);
                // if no user is deleted, user id was not found or user does not belong to requester's team
                if (lodash.isEmpty(updateResponse)) {
                    return Promise.reject({ id: 400, msg: 'Adding user to the team failed or user already added to team.' });
                } else {
                    // TODO: Add to general group when using groups
                    // delete the invitation token
                    return invitation.destroy();
                }
            })
    }
}

/**
 * If invitation is valid and found in database, create a reset password token by calling forgot password
 * @method callForgotPassword
 * @param {Object} decodedToken The decoded token used to get the email Id and the team Id
 * @param {Object} header The complete headers forwarded to get the origin URL in forgotPassword
 * @param {Seneca} seneca The seneca instance
 * @returns {Promise} Promise containing the output of forgotPassword(reset URL and reset token) if successful, else
 * containing the error message
 */
function callForgotPassword(decodedToken, header, seneca) {
    return utils.microServiceCallPromise(seneca, 'auth', 'forgotPassword', { email: decodedToken.email, teamId: decodedToken.teamId, fromInvitation: true }, header, true);
}

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {String} result The final result to be returned, contains the token created
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    // if the invitation is valid and reset URL and token is returned by forgot password, return them
    if (!lodash.isEmpty(result)) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2220, result, 'Invitation')
        });
    } else {
        //else return error
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2000, null, 'Invitation verified successfully and user added to team.')
        });
    }
}

/**
 * This is a POST action for the Invitation microservice
 * It validates the invitation token and checks if its stored in database, then calls forgot password to create a reset
 * token for it to be used to reset the password by the invited user
 * @param {Object} options Contains the seneca instance
 */
module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function(args, done) {

        // load mongoose model for invitations
        Invitation = Invitation || dbConnection.models.invitations;
        User = User || dbConnection.models.users;
        Email = Email || dbConnection.models.emails;
        Team = Team || dbConnection.models.teams;

        var decodedToken = null; // stores the decoded token
        var invitationInstance = null;

        // verify and decode the input invitation token and pass an error message if invalid
        utils.verifyTokenAndDecode(args.header.authorization, 'Invalid invitation. Invitation might have expired. ' +
                'Please ask admin to resend invite.')
            .then(function(response) {
                decodedToken = response; // save the decoded token details

                // check if the invitation is present in the database or has already been used
                return checkInDB(args.header.authorization, response)
            })
            .then(function(response) {

                invitationInstance = response;
                // call forgot password to create a reset token
                return fetchUser(decodedToken.email, args.header, seneca);
            })
            .then(function(user) {
                console.log("Response of fetch user ---- ", user);

                // call forgot password to create a reset token
                return addUserToTeam(user, invitationInstance, decodedToken, args.header, seneca);
            })
            .then(function(response) {
                console.log("Response of ---- ", response);
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