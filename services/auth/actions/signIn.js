'use strict';

var signIn = require(__base + 'sharedlib/signIn');
var session = require(__base + 'sharedlib/session');
var lodash = require('lodash');
var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var url = require('url');
var User = null;
var Team = null;
var Session = null;
var Email = null;
/**
 * @module signIn
 */

// create Joi schema
var signInSchema = Joi.object().keys({
    type: Joi.string().trim().valid('email', 'google', 'linkedIn', 'facebook', 'microsoft').required(),
    email: Joi.string().trim().when('type', {
        is: 'email',
        then: Joi.string().regex(/^\s*[\w\-\+​_]+(\.[\w\-\+_​]+)*\@[\w\-\+​_]+\.[\w\-\+_​]+(\.[\w\-\+_]+)*\s*$/)
            .required()
    }), // required only if type is email
    password: Joi.string().trim().when('type', {
        is: 'email',
        then: Joi.string().required()
    }), // required only if type is email
    socialId: Joi.string().trim().when('type', {
        is: ['google', 'linkedIn', 'facebook', 'microsoft'],
        then: Joi.string().required()
    }), // required only if type is facebook, google, microsoft, linkedIn
    socialName: Joi.string().trim(),
    socialProfilePic: Joi.string().trim(),
    socialEmail: Joi.string().regex(/^\s*[\w\-\+_]+(\.[\w\-\+_]+)*\@[\w\-\+_]+\.[\w\-\+_]+(\.[\w\-\+_]+)*\s*$/),
    gender: Joi.string().trim(),
    birthDate: Joi.string().trim(),
    subDomain: Joi.string()
}).without('email', ['socialId', 'socialEmail', 'socialName', 'socialProfilePic']);
// if email is present, the other fields should not be present

/**
 * Check if team is deployed and is not deleted
 * @method checkTeamStatus
 * @param {Object} orgDetails used to get team details
 * @returns {Promise} Promise containing the team details if successful, else containing the error message
 */
function checkTeamStatus(orgDetails) {
    return new Promise(function(resolve, reject) {
        // console.log("Team details in checkTeam ---- ", orgDetails);
        if (!lodash.isEmpty(orgDetails)) { //check if team details are present
            if (orgDetails.isUpdated == true && orgDetails.isDeleted == false) {
                resolve(orgDetails);
            } else {
                if (orgDetails.isDeleted == true) {
                    reject({ id: 400, msg: 'This Team is currently disabled. Please contact Team Admin.' });
                } else {
                    reject({ id: 400, msg: 'This Team is not deployed' });
                }
            }
        } else {
            reject({ id: 400, msg: 'Invalid Team/Sub-Domain' });
        }
    })
}

/**
 * Checks if team is deployed, if yes then checks if user belongs to team and if user is the owner of the team
 * @method checkIfUserMemberInTeam
 * @param {Object} orgDetails The team details
 * @param {Object} user The user instance
 * @returns {Promise} Promise containing the true details if successful, else containing the error message
 */
function checkIfUserMemberInTeam(orgDetails, user) {
    return checkTeamStatus(orgDetails)
        .then(function(response) {
            // console.log("------- ", userDetails, response, orgDetails.teamId);
            if (response.ownerId == user.userId) { //check if userId is same as ownerId of team
                return fetchAllTeams(user, null, null);
            } else {
                return fetchAllTeams(user, orgDetails.teamId, null);
            }
        });
}

/**
 * Fetches teams that the user belongs to and the user's owned teams. If the user does not belong to the team, error is returned.
 * @method fetchAllTeams
 * @param {Object} user The user instance
 * @param {Number} teamId (Optional) The Id of the team, if present checks if the user belongs to this team by teamId
 * @param {String} fqdn (Optional) The team's FQDN, if present checks if the user belongs to this team by fqdn
 * @returns 
 */
function fetchAllTeams(user, teamId, fqdn) {
    var orgs = {};
    orgs[url.parse(process.env.HTTPSCHEME + '://' + process.env.APP_URL).hostname] = { teamId: null, isOwner: user.registrationStep != null };
    var userId = user.userId;
    var inTeam = false;
    return user.getTeams({ where: { isDeleted: false }, attributes: ['teamId', 'ownerId', 'fqdn'] })
        .then(function(fetchedTeams) {
            console.log("orgs ---- ", fetchedTeams);
            if (!lodash.isEmpty(fetchedTeams)) {
                fetchedTeams.forEach(function(org) {
                    orgs[org.fqdn] = { teamId: org.teamId, isOwner: org.ownerId == userId }
                    if (teamId && !inTeam && org.teamId == teamId) {
                        inTeam = true;
                    } else if (fqdn && !inTeam && org.fqdn == fqdn) {
                        inTeam = true;
                    }
                });
                console.log("orgs after for each ---- ", orgs, inTeam);
            }
            if (teamId && !inTeam) {
                return Promise.reject({ id: 400, msg: 'User does not belong to this team.' });
            }
            return user.getOwnedTeams({ where: { isDeleted: false }, attributes: ['teamId', 'ownerId', 'fqdn'] })
        })
        .then(function(fetchedTeams) {
            if (fetchedTeams) {
                fetchedTeams.forEach(function(org) {
                    orgs[org.fqdn] = { teamId: org.teamId, isOwner: org.ownerId == userId };
                    if (fqdn && !inTeam && org.fqdn == fqdn) {
                        inTeam = true;
                    }
                });
            }
            if (fqdn && !inTeam) {
                return Promise.reject({ id: 400, msg: 'User does not belong to this team.' });
            }
            console.log("After merging ---- ", orgs);
            return orgs;
        })
}


function fetchTeam(user, header, protocol) {
    header = url.parse(header.origin);
    header = header.host;
    var urlComp = header.split(':'); // remove the trailing port for localhost

    // if main site, no need to check if user exists in the team    
    if (urlComp[0] == process.env.APP_URL) {
        return fetchAllTeams(user, protocol, null, null);
    } else { // for any other sub domain, need to check if the team exists and user belongs to it
        return fetchAllTeams(user, protocol, null, urlComp[0]);
    }
}

/**
 * Formats the output response and returns the response.
 * @method sendResponse
 * @param {Object} result - The final result to return.
 * @param {Function} done - the done formats and sends the response.
 */
var sendResponse = function(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2010, result)
        });
    } else {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
};

/**
 * This is a POST action for the Authentication microservice
 * Used to Sign in user using email or social login
 * @param {Object} options - Variables needed for database connection and microservices related details
 */
module.exports = function(options) {
    options = options || {};
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function(args, done) {

        var finalResponse = null; // stores the final response to be returned
        var user = null;
        var emails = null;
        var orgs = {};
        var teamId = null;
        var isOwner = false;

        // load database models
        User = User || dbConnection.models.users;
        Team = Team || dbConnection.models.teams;
        Email = Email || dbConnection.models.emails;
        Session = Session || dbConnection.models.sessions;

        if (args.body.email) {
            args.body.email = args.body.email.toLowerCase();
        }
        if (args.body.subDomain) { // if sub-domain is present
            args.header.origin = args.body.subDomain + '.' + process.env.DOMAIN; //manipulate the
            // header origin to sub-domain passed
            // args.header.host = args.body.subDomain +'.'+ process.env.DOMAIN;
        }
        
        utils.checkInputParameters(args.body, signInSchema)
            .then(function() {
                return signIn.findUser(User, Email, args.body, args.header, seneca);
            })
            .then(function(userInstance) {
                return signIn.comparePasswords(args.body, userInstance);
            })
            .then(function(response) {
                user = response;
                emails = lodash.keys(lodash.keyBy(response.toJSON().emails, 'email'));
                if (args.body.subDomain) {
                    return utils.microServiceCallPromise(seneca, 'teams', 'checkStatus', { subDomain: args.body.subDomain }, null, true, { isMicroservice: true })
                } else {
                    return new Promise(function(resolve) {
                        resolve(true);
                    })
                }
            })
            .then(function(response) {
                if (args.body.subDomain) {
                    return checkIfUserMemberInTeam(response.content.data, user);
                } else {
                    return fetchTeam(user, args.header);
                }
            })
            .then(function(org) {
                var fqdn = null;
                orgs = org;
                var hostName = args.body.subDomain ? args.header.origin : url.parse(args.header.origin).hostname;
                console.log("hostname --- ", hostName);
                if (orgs[hostName]) {
                    teamId = orgs[hostName].teamId;
                    isOwner = orgs[hostName].isOwner;
                }
                console.log("Team ----- ", org);
                // console.log("Response of checkMember/fetchTeam ---- ", orgDetails);
                return signIn.updateLoginTime(User, user);
            })
            .then(function(userDetails) {
                delete userDetails.password;
                userDetails.teamId = teamId;
                userDetails.isOwner = isOwner;
                userDetails.emails = emails;
                userDetails.origin = orgs;
                return utils.createJWT(userDetails, args.header);
            })
            .then(function(response) {
                delete response.output.origin;
                finalResponse = response.output;
                response.sessionData.emailId = args.body.email;
                return session.createSession(Session, response.output.token, response.sessionData);
            })
            .then(function(response) {
                sendResponse(finalResponse, done);
            })
            .catch(function(err) {
                console.log('----signIn error---- ', err);
                var error = err || { id: 400, msg: "Unexpected error" };
                done(null, { statusCode: 200, content: 'success' in error ? error : utils.error(error.id, error.message || error.msg, microtime.now()) });
            });
    };
};