'use strict';

var bcrypt = require('bcrypt');
var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var Promise = require('bluebird');
var lodash = require('lodash');
var microtime = require('microtime');
var User = null;
var Token = null;
var Email = null;
var Organization = null;

/**
 * @module changePassword
 */

// create Joi schema for passwords
var changePasswordSchema = Joi.object().keys({
    password: Joi.string().min(6).max(60).required() // the passwords must have length between 6 and 60
});

/**
 * Update user's password to new password.
 * If user is not found in DB, create user with first name and last name from token and hashed input password,
 * and add user to organization received in token (for reset password links sent in invitation emails)
 * Otherwise update existing user with new password.
 * @method changePassword
 * @param {Object} decodedToken Contains the user's email, firstName and lastName decoded from the token
 * @param {Object} input The input parameters containing the new password
 * @param {Object} action The action being performed. Decided by the route hit, either changePassword or resetPassword.
 * @returns {Promise} Promise containing the update response if successful, else the appropriate error message
 */
var changePassword = function(decodedToken, input, action) {
    // create find object for user by using email from token
    // add where condition to join
    var find = { include: [{ model: Email, as: 'emails', where: { email: decodedToken.emailId } }] };

    // create update object for user
    var update = {
        password: bcrypt.hashSync(input.password, 10), // hash the input password
        passwordStatus: 'passwordSet'
    };
    if (decodedToken.firstName) { // if token contains user's first name, set it in the update data object
        update.firstName = decodedToken.firstName;
    }
    if (decodedToken.lastName) { // if token contains user's last name, set it in the update data object
        update.lastName = decodedToken.lastName;
    }

    // update user document by email
    return User.findOne(find)
        .then(function(user) {
            // if user not found, user does not exist, create user after checking if action is reset password
            if (lodash.isEmpty(user)) {
                // check if action is reset password to check if new user should be created
                if (action === 'resetPassword') {
                    // add email to update object to create new email row and associate it with user
                    update.emails = [{ email: decodedToken.emailId }];
                    // create new user with update object
                    return User.create(update, { include: [{ model: Email, as: 'emails' }] })
                        .then(function(newUser) {
                            // if the created user instance returned is empty, return failed error message 
                            if (lodash.isEmpty(newUser)) {
                                return Promise.reject({ id: 400, msg: "Updating password failed." });
                            } else {
                                // if user created successfully, add user to organization
                                return newUser.addOrganization(decodedToken.orgId);
                            }
                        })
                        /*.then(function (addOrg) {
                            console.log("After adding organization --- ", addOrg);
                            return Promise.resolve(true);
                        })*/
                } else {
                    // if user is not found and action is change password, return error
                    return Promise.reject({ id: 400, msg: "Updating password failed. User not found." });
                }
            } else {
                // if user is found, update the user password
                return user.update(update);
            }
        })
        .catch(function(err) {
            return Promise.reject({ id: 400, msg: err || 'Password not changed.' });
        });
};

/**
 * Remove reset password document from database if action is resetPassword
 * @method removeTokenFromDB
 * @param {String} action Contains the action being performed, resetPassword or changePassword
 * @param {String} token The token to be deleted
 * @returns {Promise} Promise containing the update response if successful, else the appropriate error message
 */

function removeTokenFromDB(action, token) {
    if (action === 'resetPassword') { // if action is resetPassword, delete token, else skip this
        // find matching token in database
        return Token.findOne({ where: { 'token': token } })
            .then(function(token) {
                // if token is not found in database, return error message
                if (lodash.isEmpty(token)) {
                    return Promise.reject({ id: 400, msg: "Invalid reset token. Please generate new reset token from Forgot Password or Invitation." });
                } else {
                    // if token is found, delete token
                    return token.destroy();
                }
            })
    } else { // if any other action, continue
        return Promise.resolve(true);
    }
};

/**
 * Delete invitation document from database if invited user is setting password for the first time
 * @method removeInvitation
 * @param {String} email Contains the user's email decoded from the token
 * @param {Object} header JWT token containing the organization Id and isMicroservice flag
 * @param {Seneca} seneca Seneca instance to call microservice
 */
var removeInvitation = function(email, header, seneca) {
    utils.microServiceCall(seneca, 'invitations', 'deleteInvitation', { email: email }, header, null);
};

/**
 * Add the user to the general department
 * @method removeInvitation
 * @param {String} userId The Id of the user to be added to the general department of the organization
 * @param {Object} header JWT token containing the organization Id and isMicroservice flag
 * @param {Seneca} seneca Seneca instance to call microservice
 */
var addInvitedToGeneral = function(userId, header, seneca) {
    utils.microServiceCall(seneca, 'departments', 'updateDepartment', { action: 'addAgents', deptId: 'general', agentIds: [userId] }, header, null);
};

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {Object} result The final result to be returned, contains the result of the update statement
 * @param {Function} done The done formats and sends the response
 */
var sendResponse = function(done) {
    done(null, { statusCode: 200, content: outputFormatter.format(true, 2050, null, 'Password') });
};

/**
 * This is a PUT action for the Authentication microservice
 * Used to change or reset the user's password
 * @param {Object} options  Variables needed for database connection and microservices related details
 */
module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function(args, done) {

        console.log("Change/Reset password called ------ ");

        // load database models
        User = User || dbConnection.models.users;
        Token = Token || dbConnection.models.tokens;
        Email = Email || dbConnection.models.emails;
        Organization = Organization || dbConnection.models.organizations;

        var action = 'resetPassword'; // stores if password is being reset or changed, default - reset
        var decodedToken = null;

        // setting the action(resetPassword or changePassword) from the route endpoint
        if (args.endPoint) {
            action = args.endPoint.split('/');
            action = action[action.length - 1];
        }

        utils.checkInputParameters(args.body, changePasswordSchema)
            .then(function() {
                return utils.verifyTokenAndDecode(args.header.authorization);
            })
            .then(function(response) {
                decodedToken = response;
                // remove the reset password token from DB if action is resetPassword
                return removeTokenFromDB(action, args.header.authorization);
            })
            .then(function() {
                // change or reset the user password
                return changePassword(decodedToken, args.body, action);
            })
            .then(function(updateResponse) {
                console.log("Updated response ---- ", updateResponse);
                // if new user is created, remove invitation and add invited user to general
                if (updateResponse === true) {
                    // create a token to send to API in microservice calls containing organization Id
                    var header = utils.createMsJWT({ orgId: decodedToken.orgId, isMicroservice: true });
                    console.log("Removing invitation token ---- ");
                    removeInvitation(decodedToken.emailId, header, seneca);

                    // TODO: Uncomment on adding ugrp
                    // addInvitedToGeneral(updateResponse.upserted[0]._id, header, seneca);
                }
                sendResponse(done);
            })
            .catch(function(err) {
                console.log("Error in changePassword ---- ", err);
                seneca.log.error('[ ' + process.env.SRV_NAME + ': ' + __filename.split('/').pop() + ' ]', "ERROR" +
                    " : ", err);
                var error = err || { id: 400, msg: 'Unexpected error' };
                done(null, { statusCode: 200, content: utils.error(error.id, error.msg, microtime.now()) });
            });
    };
};