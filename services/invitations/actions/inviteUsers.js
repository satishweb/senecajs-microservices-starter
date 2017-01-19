'use strict';

var response = require(__base + '/sharedlib/utils'); //what is response here???
var utils = require(__base + '/sharedlib/utils');
var Locale = require(__base + '/sharedlib/formatter');
var authentication = require(__base + '/sharedlib/authentication');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var mongoose = require('mongoose');
var Promise = require('bluebird');
var jwt = require('jsonwebtoken');
var microtime = require('microtime');
var Invitation = null;


// create Joi schema
//TODO: MOVE
var saveInvitedUsersSchema = Joi.object().keys({
    users: Joi.array().items(Joi.object().keys({
        email: Joi.string().trim().regex(/^\s*[\w\-\+​_]+(\.[\w\-\+_​]+)*\@[\w\-\+​_]+\.[\w\-\+_​]+(\.[\w\-\+_]+)*\s*$/)
            .required(),
        firstName: Joi.string().trim().required(),
        lastName: Joi.string().trim()
    }).required()).required()
});

/**
 * Check input parameter using Joi
 * @method checkInputParameters
 * @param {Object} input Used to get the input parameters to validate
 * @param {Object} schema Used to get the input parameters to validate
 * @returns {Promise} Promise containing true if input validated successfully, else containing the error message
 */
var checkInputParameters = function(input, schema) {
    return new Promise(function(resolve, reject) {
        Joi.validate(input, schema, function(err, result) {
            if (err) {
                reject({ id: 400, msg: err.details[0].message });
            } else {
                resolve(result);
            }
        });
    });
};

//TODO: All verify token functions can be deleted and used from utils
function verifyTokenAndDecode(token) {
    return new Promise(function(resolve, reject) {
        jwt.verify(token, process.env.JWT_SECRET_KEY, function(err, decoded) {
            if (err) {
                reject({ id: 400, msg: err });
            } else if (decoded && decoded.orgId && decoded.isOwner) {
                resolve(decoded);
            } else {
                reject({ id: 400, msg: "Only organization owner can invite users." });
            }
        });
    });
};

var fetchMatchingPendingInvitations = function fetchMatchingPendingInvitations(emailIds, orgId) {
    return new Promise(function(resolve, reject) {
        Invitation.find({ email: { $in: emailIds }, orgId: orgId }, function(err, invitationPending) {
            console.log("Result of pending invitations ----", err, invitationPending);
            if (err) {
                reject({ id: 400, msg: err.msg });
            } else {
                resolve({ all: emailIds, pending: invitationPending });
            }
        });
    });
};

var fetchUsers = function fetchUsers(seneca, emailIds, orgId) {
    return new Promise(function(resolve, reject) {
        utils.microServiceCall(seneca, 'users', 'getUsers', { action: "list", filter: { email: emailIds } },
            authentication.createMsJWT({ orgId: orgId, isMicroservice: true }),
            function(err, response) {
                console.log("Response of listUsers ------ ", err, response);
                if (err || (response && response.content && !response.content.success)) {
                    reject({ id: 400, msg: err || response.content.message.description })
                } else {
                    resolve({ uninvited: emailIds, existing: response.content.data.content });
                }
            });
    });
};

var sendInvitations = function sendInvitations(seneca, orgId, input, newUsers, pendingInvitations, url) {
    // for new users - generate JWT, store in invitation and send emails
    // for pending invitees - resend token
    url += '/#/invitation?inviteToken=';
    if (newUsers && lodash.isArray(newUsers)) {
        newUsers.forEach(function(email) {
            var data = { email: email, firstName: input[email].firstName, lastName: input[email].lastName, orgId: orgId };
            var jwt = createJwt(data);
            data.token = jwt;
            var invitation = new Invitation(data);
            invitation.save(function(err, result) {
                if (err) {
                    console.log("Error creating invitation ----- ");
                } else {
                    console.log("sending mail to new ---- ", email);
                    sendEmail(seneca, data, url);
                }
            });
        });
    }
    console.log("Pending invitations ---- ", pendingInvitations);
    if (pendingInvitations && lodash.isArray(pendingInvitations)) {
        pendingInvitations.forEach(function(invite) {
            console.log("Sending mail to pending ---- ", invite.email);
            sendEmail(seneca, invite, url)
        })
    }
};

/**
 *  Send invitation emails
 * @method sendInvitationToUser
 * @param {Object} input Used to get the input parameter (email)
 * @param {Seneca} seneca The seneca instance, used to call other microservice
 * @returns {Promise} Promise containing true if email is found in database, else containing the error message
 */
function sendEmail(seneca, input, url) {
    var token = createJwt({ 'isMicroservice': true });
    var body = {
        subject: outputFormatter.email('InvitationSubject')
    };
    body.emailId = [input.email];
    body.content = outputFormatter.email('InvitationMessage', input.firstName || 'User', url + input.token);
    utils.microServiceCall(seneca, 'email', 'sendEmail', body, token, null);
}

function createJwt(input) {
    var options = { expiresIn: process.env.INVITATION_EXPIRY_TIME }; // set the token expiry time
    var key = process.env.JWT_SECRET_KEY;
    return jwt.sign(input, key, options);
}

/**
 * Formats the output response and returns the response.
 * @function sendResponse
 * @param {Function} done - the done formats and sends the response.
 *
 */
var sendResponse = function(done) {
    done(null, { statusCode: 200, content: outputFormatter.format(true, 2000, null, "Invitation has been sent successfully.") });
};

module.exports = function(options) {
    var seneca = options.seneca;
    return function(args, done) {
        Invitation = mongoose.model('Invitations');
        var orgId = null;
        var input = null;
        var pendingInvitations = null;
        checkInputParameters(args.body, saveInvitedUsersSchema)
            .then(function() {
                return verifyTokenAndDecode(args.header.authorization)
            })
            .then(function(decoded) {
                orgId = decoded.orgId;
                //fetch invitation pending users matching input emailIds and remove them from input and store invitations
                input = lodash.keyBy(args.body.users, 'email');
                var emailIds = lodash.keys(input);
                console.log("Email ids ------ ", emailIds);
                return fetchMatchingPendingInvitations(emailIds, orgId);
            })
            .then(function(response) {
                //fetch users matching remaining input emailIds and remove them from input
                pendingInvitations = response.pending;
                var pendingEmails = lodash.keys(lodash.groupBy(response.pending, 'email'));
                console.log("Pending emails ----- ", pendingEmails);
                var uninvited = lodash.difference(response.all, pendingEmails);
                console.log("Uninvited emails ----- ", uninvited);
                return fetchUsers(seneca, uninvited, orgId);
            })
            .then(function(response) {
                //create invitation and send mail to each invitee
                console.log("Existing users ----- ", response.existing);
                var existingUserEmails = lodash.keys(lodash.keyBy(response.existing, 'email'));
                var newUsers = lodash.difference(response.uninvited, existingUserEmails);
                console.log("New users to invite ---- ", newUsers);
                sendInvitations(seneca, orgId, input, newUsers, pendingInvitations, args.header.origin || ('https://' + process.env.APP_URL));
                sendResponse(done);
            })
            .catch(function(err) {
                console.log("Error in inviteUsers --- ", err);
                done(null, {
                    statusCode: 200,
                    content: err.success === true || err.success === false ? err : response.error(err.id || 400, err ? err.msg || err : 'Unexpected error', microtime.now())
                });
            });
    };
};