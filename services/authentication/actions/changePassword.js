'use strict';

var bcrypt = require('bcrypt');
var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__dirname + '/../');
var Joi = require('joi');
var Promise = require('bluebird');
var lodash = require('lodash');
var microtime = require('microtime');
var User = null;
var Token = null;

/**
 * @module changePassword
 */

// create Joi schema for passwords
var changePasswordSchema = Joi.object().keys({
    password: Joi.string().min(6).max(60).required() // the passwords must have length between 6 and 60
});

/**
 * Update user's password to new password and corrects the value of flags like passwordStatus and invitationPending
 * @method changePassword
 * @param {Object} decodedToken Contains the user's email, firstName and lastName decoded from the token
 * @param {Object} input The input parameters containing the new password
 * @returns {Promise} Promise containing the update response if successful, else the appropriate error message
 */
var changePassword = function(decodedToken, input) {
    return new Promise(function(resolve, reject) {
        //create find object for user
        var find = { email: decodedToken.emailId};

        if (input.orgId) {
            find.orgId = input.orgId;
        } else {
            find.orgId = null;
        }
        // create update object for user
        var update = {
            password: bcrypt.hashSync(input.password, 10), // hash the input password
            passwordStatus: 'passwordSet',
            invitationPending: false
        };
        if (decodedToken.firstName) {   // if token contains user's first name, set it in the update data object
            update.firstName = decodedToken.firstName;
        }
        if (decodedToken.lastName) {   // if token contains user's last name, set it in the update data object
            update.lastName = decodedToken.lastName;
        }
        if (decodedToken.orgId) {   // if token contains the organization id, set it in the update data object
            update.orgId = decodedToken.orgId;
        }

        // console.log("Find ---- ", find, update);

        //TODO: Replace with model instance static method
        // update user document by email
        User.update(find, update)
            .then(function(updateResult) {
                // console.log("UpdateResult ---- ", updateResult);
                if (lodash.isEmpty(updateResult)) {
                    update = lodash.assign(find, update);
                    User.create(update)
                        .then(function (createResult) {
                            resolve(createResult);
                        })
                        .catch(function (err) {
                            reject({ id: 400, msg: err});
                        });
                } else {
                    resolve(updateResult);
                }
            })
            .catch(function (err) {
                // console.log("Error in change password ---- ", err);
                reject({ id: 400, msg: err || 'Password not changed.' });
            });
    });
};

/**
 * Remove reset password document from database if action is resetPassword
 * @method removeTokenFromDB
 * @param {String} action Contains the action being performed, reset or change
 * @param {String} token The token to be deleted
 * @returns {Promise} Promise containing the update response if successful, else the appropriate error message
 */

function removeTokenFromDB(action, token) {
    return new Promise(function(resolve, reject) {
        if (action === 'resetPassword') { // if action is resetPassword, delete token, else skip this
            Token.destroy({ 'token': token })
                .then(function(result) {
                    if (lodash.isEmpty(result)) { // if no document was removed, return error
                        reject({ id: 400, msg: "Invalid reset token. Please generate new reset token from Forgot Password or Invitation." });
                    } else {
                        resolve(true);
                    }
                })
                .catch(function (err){
                    // console.log("Error in delete token ---- ", err);
                    reject({ id: 400, msg: err });
                });
        } else {    // if any other action, continue
            resolve(true);
        }
    });
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
var sendResponse = function(result, done) {
    // if any document was modified or created, send success response
    if (!lodash.isEmpty(result)) {
        done(null, { statusCode: 200, content: outputFormatter.format(true, 2050, null, 'Password') });
    } else {
        done(null, { statusCode: 200, content: outputFormatter.format(true, 1000, null, 'Something went wrong.' +
            ' Please Try again.') });
    }
};

/**
 * This is a PUT action for the Authentication microservice
 * Used to change or reset the user password
 * @param {Object} options  Variables needed for database connection and microservices related details
 */
module.exports = function(options) {
    var seneca = options.seneca;
    var ontology = options.wInstance;
    return function(args, done) {

        // load waterline models
        User = User || ontology.collections.users;
        Token = Token || ontology.collections.tokens;


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

                // if orgId is present and user is not owner, switch to organization's user collection
                if (response.orgId && !response.isOwner) {
                    args.body.orgId = response.orgId;
                }
                return removeTokenFromDB(action, args.header.authorization);
            })
            .then(function() {
                return changePassword(decodedToken, args.body);
            })
            .then(function(updateResponse) {
                // console.log("Updated response ---- ", updateResponse);
                // if new user is created, remove invitation and add invited user to general
                if (updateResponse && updateResponse.upserted && updateResponse.upserted[0] && updateResponse.upserted[0]) {
                    // create a token to send to API in microservice calls containing organization Id
                    var header = utils.createMsJWT({ orgId: decodedToken.orgId, isMicroservice: true });
                    removeInvitation(decodedToken.emailId, header, seneca);
                    addInvitedToGeneral(updateResponse.upserted[0]._id, header, seneca);
                }
                sendResponse(updateResponse, done);
            })
            .catch(function(err) {
                console.log("Error in changePassword ---- ", err);
                seneca.log.error('[ ' + process.env.SRV_NAME + ': ' + __filename.split('/').slice(-1) + ' ]', "ERROR" +
                  " : ", err);
                var error = err || { id: 400, msg: 'Unexpected error' };
                done(null, { statusCode: 200, content: utils.error(error.id, error.msg, microtime.now()) });
            });
    };
};