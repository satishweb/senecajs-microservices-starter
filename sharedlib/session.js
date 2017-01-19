var lodash = require('lodash');
var mongoose = require('mongoose');
var Promise = require('bluebird');
var microtime = require('microtime');
var Session = null;

// Create mongoose schema for sessions model
var Sessions = new mongoose.Schema({
    JWT: { type: String, default: null },
    sessionData: {
        firstName: { type: String, default: null },
        lastName: { type: String, default: null },
        avatar: { type: String, default: null },
        userId: { type: String, default: null },
        emailId: { type: String, default: null },
        accountType: { type: String, default: null },
        lastLoggedInTime: { type: Number, default: null }
    }
});
Sessions.set('timestamps', true); // add timestamp middleware to schema
Sessions.set('toJSON', { // add middleware to transform result on calling toJSON
    transform: function(doc, ret, options) {
        ret.sessionId = ret._id;
        delete ret._id;
        delete ret.__v;
    }
});
mongoose.model("Sessions", Sessions);   // registering mongoose model using schema 

module.exports.SessionObject = Sessions;

/**
 * Create a new Session and delete all previous sessions of the user for that organization
 * @method createSession
 * @param {Object} Session Session mongoose model
 * @param {String} token The generated token specific to the session
 * @param {String} sessionData The user details stored in the token
 * @returns {Object} Promise containing Session document if resolved(session successfully created), else error message
 */

module.exports.createSession = function(Session, token, sessionData) {
    var that = this;
    return new Promise(function(resolve, reject) {
        var sessionModelData = {
            JWT: token,
            sessionData: sessionData
        };
        var session = new Session(sessionModelData);    // create instance of model populated with session data to store

        // insert document into collection
        session.save(function(err, result) {
            if (err) {
                reject({ id: 400, msg: "Session not created." });
            } else {
                // if session is saved successfully, delete all previous sessions of user for this organization
                if (result && result.sessionData) {
                    that.deleteSessions(Session, result.sessionData.userId, result.sessionData.orgId, result._id);
                }
                resolve(result);
            }
        });
    });
};

/**
 * Delete all previous sessions of a user related to a organization excluding session with Id sessionId
 * @method deleteSessions
 * @param {Object} Session Session mongoose model
 * @param {String} userId The the user whose sessions are being deleted
 * @param {String} orgId The organization whose sessions are to be deleted
 * @param {String} sessionId Optional, Current session Id if current session is not to be deleted
 */

module.exports.deleteSessions = function deleteSessions(Session, userId, orgId, sessionId) {
    var find = { 'sessionData.userId': userId, 'sessionData.orgId': orgId }; // create find query
    if (sessionId) { // if sessionId is present, exclude it from remove
        find._id = { '$ne': sessionId };
    }
    // remove sessions matching the find query
    Session.remove(find, function(err, response) {
        if (err) {
            console.log('Error in Delete Session', err);
        } else {
            console.log('Session Deleted');
        }
    });
};


/**
 * Get the session document from mongo corresponding to the token
 * @method getSession
 * @param {String} token Token whose session is being fetched
 * @returns {Promise} The resolved Promise containing the session if found and rejected Promise with error if error
 * or session not found
 */

module.exports.getSession = function(token) {
    Session = Session || mongoose.model('Sessions');
    return new Promise(function(resolve, reject) {
        Session.findOne({ JWT: token }, function(err, result) {
            // if find returns error or no session found, reject with error message
            if (err || lodash.isEmpty(result)) {
                reject({ id: '501', msg: "Session does not exist. Please log in." })
            } else {
                resolve(result);
            }
        });
    });
};

/**
 * Check if the request header fields match those in the token to verify token belongs to requester
 * @method validateSession
 * @param {Object} session Session document fetched from database
 * @param {Object} decodedToken Decoded token
 * @param {Object} requestHeaders Header received in current request
 * @returns {Promise} The resolved Promise containing the decoded token data if token details and header
 * details match or rejected Promise with false if they don't
 */

module.exports.validateSession = function(decodedToken, requestHeaders) {
    return new Promise(function(resolve, reject) {
        // compare received header properties with those stored in token
        if (decodedToken.userAgent === requestHeaders['user-agent'] && decodedToken.origin === requestHeaders.origin &&
            decodedToken.hostIp === requestHeaders['x-forwarded-for'] && decodedToken.host === requestHeaders.host) {
            resolve(decodedToken);
        } else {
            reject({id: '501', msg: "Token-header mismatch. Please log in again."});
        }
    });
};