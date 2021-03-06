var lodash = require('lodash');
var Promise = require('bluebird');
var url = require('url');
var microtime = require('microtime');

/**
 * Create a new Session and delete all previous sessions of the user for that team
 * @method createSession
 * @param {Object} Session Session waterline model
 * @param {String} token The generated token specific to the session
 * @param {String} sessionData The user details stored in the token
 * @returns {Object} Promise containing Session document if resolved(session successfully created), else error message
 */

module.exports.createSession = function(Session, token, sessionData) {
    var that = this;
    return new Promise(function(resolve, reject) {
        sessionData.JWT = token;

        // insert document into collection
        Session.create(sessionData)
            .then(function(createdSession) {
                // if session is saved successfully, delete all previous sessions of user for this team
                that.deleteSessions(Session, createdSession.userId, createdSession.teamId, createdSession.sessionId);
                resolve(sessionData);
            })
            .catch(function (err) {
                console.log("Error in create session ---- ", err);
                reject({id: 400, msg: "Session not created."});
            })
    });
};

/**
 * Delete all previous sessions of a user related to a team excluding session with Id sessionId
 * @method deleteSessions
 * @param {Object} Session Session waterline model
 * @param {String} userId The the user whose sessions are being deleted
 * @param {String} teamId The team whose sessions are to be deleted
 * @param {String} sessionId Optional, Current session Id if current session is not to be deleted
 */

module.exports.deleteSessions = function deleteSessions(Session, userId, teamId, sessionId) {
    var find = { where: { 'userId': userId, 'teamId': teamId } }; // create find query
    if (sessionId) { // if sessionId is present, exclude it from remove
        find.where.sessionId = { '$ne': sessionId };
    }
    // remove sessions matching the find query
    Session.destroy(find)
        .then(function (result){})
        .catch(function (err){console.log("Error in delete sessions ---- ",err);});
};

/**
 * Check if the request header fields match those in the token to verify token belongs to requester
 * @method validateSession
 * @param {Object} decodedToken Decoded token
 * @param {Object} requestHeaders Header received in current request
 * @returns {Promise} The resolved Promise containing the decoded token data if token details and header
 * details match or rejected Promise with false if they don't
 */

module.exports.validateSession = function(decodedToken, requestHeaders) {
    return new Promise(function (resolve, reject) {
        // console.log("decodedToken --- ", decodedToken, requestHeaders, !lodash.isEmpty(decodedToken.origin[requestHeaders.origin]),
        //     decodedToken.userAgent === requestHeaders['user-agent'],
        //     decodedToken.hostIp === requestHeaders['x-forwarded-for'], decodedToken.host === requestHeaders.host);
        // compare received header properties with those stored in token
        var hostName = url.parse(requestHeaders.origin).hostname;
        if (decodedToken && decodedToken.userAgent === requestHeaders['user-agent'] && decodedToken.origin && !lodash.isEmpty(decodedToken.origin[hostName]) &&
            decodedToken.hostIp === requestHeaders['x-forwarded-for'] && decodedToken.host === requestHeaders.host) {
            decodedToken.teamId = decodedToken.origin[hostName].teamId;
            decodedToken.isOwner = decodedToken.origin[hostName].isOwner;
            console.log(decodedToken.origin[hostName].teamId, decodedToken.origin[hostName].isOwner);
            resolve(decodedToken);
        } else {
            reject({id: '501', msg: "Token-header mismatch. Please log in again."});
        }
    });
};