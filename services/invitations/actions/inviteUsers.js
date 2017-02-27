'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var Promise = require('bluebird');
var jwt = require('jsonwebtoken');
var microtime = require('microtime');
var Invitation = null;
var User = null;
var Email = null;
var Team = null;

//Joi validation Schema
//TODO: MOVE
var saveInvitedUsersSchema = Joi.object().keys({
    users: Joi.array().items(Joi.object().keys({ // array of users, with email and first name as required and
        // last name optional
        email: Joi.string().trim().regex(/^\s*[\w\-\+​_]+(\.[\w\-\+_​]+)*\@[\w\-\+​_]+\.[\w\-\+_​]+(\.[\w\-\+_]+)*\s*$/)
            .required(),
        firstName: Joi.string().trim().required(),
        lastName: Joi.string().trim()
    }).required()).required()
});

/**
 * Fetches the pending invitations matching the input email Ids
 * @method fetchMatchingPendingInvitations
 * @param {String[]} emailIds The input email Ids to search for pending invitations
 * @param {String} teamId The Id of the team to search invitations for
 * @returns {Promise} Promise resolved with object containing all the input email Ids and the pending invitations if
 * successful, else rejected with the error if unsuccessful
 */
function fetchMatchingPendingInvitations(emailIds, teamId) {
    // fetch all invitations matching any of the email Id and sent for the same team
    return Invitation.findAll({ where: { email: { $in: emailIds }, teamId: teamId }, raw: true })
        .then(function(invitationPending) {
            console.log("Invitations ---- ", invitationPending);
            // if pending invitations are successfully fetched, return them along with all the
            // input email Ids
            return Promise.resolve({ all: emailIds, pending: invitationPending });
        })
};

/**
 * Fetch already created users matching the input email Ids
 * @method fetchUsers
 * @param {String[]} emailIds The array of email Ids after removing the email Ids related to pending invitations
 * @param {String} teamId The team Id whose users are to be searched
 * @returns {Promise} The Promise resolved with object containing the uninvited emails and the existing users
 * matching the email Ids if successful, else rejected with the error if unsuccessful
 */
function fetchUsers(emailIds, teamId) {

    // microservice call to getUsers to fetch existing users matching the email Ids and team
    // the input body tells the output should be a list of users whose email Ids match the given ones and they are a part of the same team
    // creating a JWT token containing the team Id and isMicroservice flag
    /*utils.microServiceCall(seneca, 'ugrp', 'getUsers', { action: "list", filter: { email: emailIds } },
        utils.createMsJWT({ teamId: teamId, isMicroservice: true }),
        function(err, response) {*/
    return User.findAll({
            include: [{
                model: Email,
                as: 'emails',
                where: { email: { $in: emailIds } },
                attributes: ['email']
            }, {
                model: Team,
                where: { teamId: teamId },
                attributes: ['teamId']
            }],
            raw: true
        })
        .then(function(users) {
            console.log("Fetched registered users ---- ", users);
            // else return the uninvited email Ids and the existing users matching those emails Ids
            return Promise.resolve({ uninvited: emailIds, existing: users });
        })
};

/**
 * Create new invitations and send them to new invitees and resend the pending invitations matching the input email Ids
 * @method sendInvitations
 * @param {Seneca} seneca The seneca instance to call microservice
 * @param {String} teamId The team Id, used to create invitation
 * @param {Object} input The input user details keyed by email Ids to fetch names
 * @param {String[]} newUsers The array of email Ids corresponding to new invitees
 * @param {String[]} pendingInvitations The array of email Ids corresponding to pending invitations
 * @param {String} url The The redirect URL sent in the email, depends on the sub domain
 */
function sendInvitations(seneca, teamId, input, newUsers, pendingInvitations, url) {

    // complete the redirect URL by adding the invitations end point to the origin
    url += '/#/invitation?inviteToken=';

    // for new invitees - generate JWT, save invitation to DB and send email
    // if there are new users present, iterate over them
    if (newUsers && lodash.isArray(newUsers)) {
        newUsers.forEach(function(email) {

            // create the input data to be stored in the JWT token
            var data = { email: email, firstName: input[email].firstName, lastName: input[email].lastName, teamId: teamId };
            var jwt = createJwt(data); // create invitation JWT token with created data
            data.token = jwt; // add token to data to save in database

            // save invitation to DB
            Invitation.create(data)
                .then(function(result) {
                    if (!lodash.isEmpty(result)) { // if invitation is saved successfully, send invitation
                        sendEmail(seneca, data, url);
                    }
                })
        });
    }

    // for pending invitees - resend token
    // if there are pending invitations present, iterate over them and send them again
    if (pendingInvitations && lodash.isArray(pendingInvitations)) {
        pendingInvitations.forEach(function(invite) { // for each pending invitee send invitation
            sendEmail(seneca, invite, url)
        })
    }
};

/**
 * Send invitation emails
 * @method sendEmail
 * @param {Object} input Contains the email Id, first name and last name
 * @param {Seneca} seneca The seneca instance, used to call other microservice
 * @param {String} url The reset URL to be sent in the email
 */
function sendEmail(seneca, input, url) {
    var token = utils.createMsJWT({ 'isMicroservice': true }); // create JWT token for microservice call

    // create the input for email - use the subject and content from the translations file and pass any arguments needed
    var body = {
        subject: outputFormatter.email('InvitationSubject'),
        emailId: [input.email],
        content: outputFormatter.email('InvitationMessage', input.firstName || 'User', url + input.token)
    };

    console.log("Sending mail to ----- ", body.emailId);    
    // make microservice call to send email
    utils.microServiceCall(seneca, 'email', 'sendEmail', body, token, null);
}

/**
 * Create an invitation JWT token from the input data
 * @method createJwt
 * @param {Object} input The data to be stored in the JWT token
 * @returns {String} The created JWT token
 */
function createJwt(input) {
    var options = { expiresIn: process.env.INVITATION_EXPIRY_TIME }; // set the token expiry time as invitation
    // expiry time
    var key = process.env.JWT_SECRET_KEY; // set the JWT secret
    return jwt.sign(input, key, options); // create the JWT token
}

/**
 * Formats the output response and returns the response.
 * @method sendResponse
 * @param {Function} done The done formats and sends the response.
 */
var sendResponse = function(done) {
    done(null, {
        statusCode: 200,
        content: outputFormatter.format(true, 2000, null, "Invitations have been sent" +
            " successfully.")
    });
};

/**
 * This is a POST action for the Invitation microservice
 * It is used to send invitations containing a link to set password and create an account
 * Invitations are not to be sent to already registered users
 * Pending invitations, the invitation is to be sent again
 * For new invitees, an invitation token is to be created, stored in database and an email containing the link sent
 * @param {Object} options Contains the seneca instance
 */
module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function(args, done) {

        // load the mongoose model for invitations collection
        Invitation = Invitation || dbConnection.models.invitations;
        User = User || dbConnection.models.users;
        Email = Email || dbConnection.models.emails;
        Team = Team || dbConnection.models.teams;

        var teamId = null; // the team Id to be set from the input token
        var input = null; // stores the input details formatted by email Ids
        var pendingInvitations = null; // to store the array of pending invitations

        // validate if input is according to Joi schema
        utils.checkInputParameters(args.body, saveInvitedUsersSchema)
            .then(function () {
                return utils.checkIfAuthorized(args.credentials, true);
            })    
            .then(function () {
                teamId = args.credentials.teamId; // set the team Id from the decoded token

                input = lodash.filter(args.body.users, function (user) { return lodash.indexOf(args.credentials.emailId, user.email) === -1; });

                // format the input array to an object with email Ids as key for easier access (removes duplicates
                // in the process)
                input = lodash.keyBy(input, 'email');
                var emailIds = lodash.keys(input); // get an array of input email Ids


                console.log("Emails --- ", emailIds);
                // fetch all pending invitations matching the input emails
                return fetchMatchingPendingInvitations(emailIds, teamId);
            })
            .then(function(response) {
                pendingInvitations = response.pending; // store the pending invitations that match the input email Ids

                // array of email Ids belonging to pending invitations to remove from input email Ids
                var pendingEmails = lodash.keys(lodash.groupBy(response.pending, 'email'));

                console.log("Pending emails --- ", pendingEmails);
                // remove the pending invitation email Ids from array of input email Ids to get uninvited users
                var uninvited = lodash.difference(response.all, pendingEmails);

                console.log("Uninvited ---- ", uninvited);
                //fetch already registered users matching the uninvited email Ids
                return fetchUsers(uninvited, teamId);
            })
            .then(function(response) {
                // array of email Ids belonging to already registered users to remove from uninvited email Ids
                var existingUserEmails = lodash.keys(lodash.keyBy(response.existing, 'emails.email'));

                console.log("Existing users --- ", existingUserEmails);
                // array of new invitees' email Ids by removing existing email Ids
                var newUsers = lodash.difference(response.uninvited, existingUserEmails);

                console.log("new Users --- ", newUsers);
                // create, save and send invitations to new users and send pending invitations to pending users
                sendInvitations(seneca, teamId, input, newUsers, pendingInvitations, args.header.origin || ('https://' + process.env.APP_URL));
                // return reply without waiting for the response of sendInvitations
                sendResponse(done);
            })
            .catch(function(err) {
                console.log("Error in inviteUsers ---- ", err);
                // in case of error, print the error and send as response
                utils.senecaLog(seneca, 'error', __filename.split('/').pop(), err);
                // if the error message is formatted, send it as reply, else format it and then send
                done(null, {
                    statusCode: 200,
                    content: err.success === true || err.success === false ? err : utils.error(err.id || 400, err ? err.msg || err : 'Unexpected error', microtime.now())
                });
            });
    };
};