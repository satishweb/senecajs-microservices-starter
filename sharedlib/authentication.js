'use strict';

var Promise = require('bluebird');
var jwt = require('jsonwebtoken');
var lodash = require('lodash');
var Joi = require('joi');

/**
 * Check input parameter using Joi
 * @method checkInputParameters
 * @param {Object} input Used to get the input parameters to validate
 * @param {Object} schema The Joi schema to be used for validation
 * @returns {Promise} Promise containing true if input validated successfully, else containing the error message
 */

module.exports.checkInputParameters = function(input, schema) {
    return new Promise(function(resolve, reject) {
        // check if the input matches the Joi schema
        Joi.validate(input, schema, function(err, result) {
            if (err) {
                reject({ id: 400, msg: err.details[0].message });
            } else {
                resolve(result);
            }
        });
    });
};

/**
 * Creates a JWT token from the user document for Sign In.
 * The token includes fields like the userId, name, email, the last logged in time and the request header details
 * like host IP, host, origin and user agent. The token is added to the user details.
 * @method createJWT
 * @param {Object} userDetails The user details of the user
 * @param {Object} requestHeaders The request header details
 * @returns {Promise} Promise containing the user details along with the token
 */

module.exports.createJWT = function(userDetails, requestHeaders) {
    return new Promise(function(resolve) {
        var key = process.env.JWT_SECRET_KEY;   // set the JWT key being used to sign the token
        var options = { expiresIn: process.env.JWT_EXPIRY_TIME }; // set the token expiry time
        var sessionData = { // Extract user details that need to be stored in the JWT token
            firstName: userDetails.firstName,
            lastName: userDetails.lastName,
            avatar: userDetails.avatar,
            userId: userDetails.userId,
            emailId: userDetails.email,
            accountType: userDetails.accountType,
            lastLoggedInTime: userDetails.lastLoggedInTime
        };
        var tokenData = { // Extract the request header details to be added to the token
            userAgent: requestHeaders['user-agent'],
            origin: requestHeaders.origin,
            hostIp: requestHeaders['x-forwarded-for'],
            host: requestHeaders.host
        };
        tokenData = lodash.assign(tokenData, sessionData); // merge user details to be added to token and session info
        userDetails.token = jwt.sign(tokenData, key, options); // create the JWT token and add it to the input
        resolve({ output: userDetails, sessionData: sessionData });
    });
};

/**
 * Create a token from input
 * @method createMsJWT
 * @param {Object} input Data to be added to the token
 * @returns {Object} Header object with the created token assigned to authorization key
 */
module.exports.createMsJWT = function(input) {
    var key = process.env.JWT_SECRET_KEY; // set the JWT key being used to sign the token
    var options = { expiresIn: process.env.JWT_EXPIRY_TIME }; // set the token expiry time
    return { authorization: jwt.sign(input, key, options) }; // create the JWT token
};

/**
 * Verify token and return the decoded token
 * @method verifyTokenAndDecode
 * @param {Object} token The token to be decoded
 * @returns {Promise} Promise containing decoded token if successful, else containing the error message
 */
module.exports.verifyTokenAndDecode = function(token) {
    return new Promise(function(resolve, reject) {
        // use JWT's verify function that verifies the signature and decodes the token
        jwt.verify(token, process.env.JWT_SECRET_KEY, function(err, decoded) {
            if (err) {
                reject({ id: 400, msg: err });
            } else {
                resolve(decoded);
            }
        });
    });
};