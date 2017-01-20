'use strict';

var moment = require('moment');
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
            firstName       : userDetails.firstName,
            lastName        : userDetails.lastName,
            orgId           : userDetails.orgId,
            avatar          : userDetails.avatar,
            userId          : userDetails.userId,
            emailId         : userDetails.email,
            isOwner         : userDetails.isOwner || false,
            accountType     : userDetails.accountType,
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

/**
 * Generic MicroService call which accepts callback as input
 * @method microServiceCall
 * @param {Seneca} seneca Seneca instance used to call microservice
 * @param {String} role MicroService name for seneca call
 * @param {String} cmd Action name for seneca call
 * @param {Object} body The input sent to the action
 * @param {Object} header The Header sent to the action
 * @param {Function} callback The callback function to be executed on response
 */
module.exports.microServiceCall = function(seneca, role, cmd, body, header, callback) {
    seneca.client({
        type: 'amqp',
        pin: ['role:' + role, 'cmd:' + cmd].join(','),
        host: process.env.QUEUE_HOST || '127.0.0.1'
    }).act({
        role: role,
        cmd: cmd,
        body: body,
        header: header
    }, callback);
};

/**
 * Generic MicroService call which resolves even in case of error
 * @method microServiceCallPromise
 * @param {Seneca} seneca Seneca instance
 * @param {String} role MicroService name for seneca call
 * @param {String} cmd Action name for seneca call
 * @param {Object} body The input sent to the action
 * @param {Object} header The Header sent to the action
 * @param {Boolean} isRejected Flag to decide if error is to be resolved with null or rejected
 * @returns {Promise} The Promise containing the action response in case of success and null in case of failure
 */
module.exports.microServiceCallPromise = function(seneca, role, cmd, body, header, isRejected) {
    return new Promise(function(resolve) {
        seneca.client({
            type: 'amqp',
            pin: ['role:' + role, 'cmd:' + cmd].join(','),
            host: process.env.QUEUE_HOST || '127.0.0.1'
        }).act({
            role: role,
            cmd: cmd,
            body: body,
            header: header
        }, function(err, response) {
            if (err) {
                if (isRejected) {
                    reject(err);
                } else {
                    resolve(null);
                }
            } else {
                resolve(response);
            }
        });
    });
};

/**
 * Prints the formatted seneca logs with the service name, file name and message
 * @function senecaLog
 * @param {seneca} seneca The seneca instance
 * @param {String} type The type of seneca log
 * @param {String} file The name of the file
 * @param {String} msg The message to be printed
 */
module.exports.senecaLog = function (seneca, type, file, msg) {
    seneca.log[type]('[ ' + process.env.SRV_NAME + ' ]', file, msg);
};

/**
 * Formats the input data to match the response structure for requests where no data is returned
 * @function success
 * @param {Number} id Operation status code
 * @param {String} msg Description
 * @param {Number} time Timestamp for the operation
 * @returns object
 */
module.exports.success = function(id, msg, time) {
    return {
        success: true,
        message: {
            id: id,
            description: msg
        },
        timestamp: time,
        version: "1.0"
    };
};

/**
 * Formats the input data to match the response structure for requests where error occurred
 * @function error
 * @param {Number} id Operation status code
 * @param {String} msg Description
 * @param {Number} time Timestamp for the operation
 * @returns object
 */
module.exports.error = function(id, msg, time) {
    return {
        success: false,
        message: {
            id: id,
            description: msg
        },
        timestamp: time,
        version: "1.0"
    };
};

/**
 * Formats the input data to match the response structure for requests where data is returned
 * @function fetchSuccess
 * @param {Number} id Operation status code
 * @param {String} msg Description
 * @param {Object} data Data to be returned to user, usually from database
 * @param {Number} time Timestamp for the operation
 * @returns object
 */
module.exports.fetchSuccess = function(id, msg, data, time) {
    return {
        success: true,
        message: {
            id: id,
            description: msg
        },
        data: data,
        timestamp: time,
        version: "1.0"
    };
};

/**
 * Converts the input time from seconds to microseconds
 * @function convertSecondsToMicroseconds
 * @param {Number} timeInSeconds The input time(in seconds) to be converted
 * @returns {Number} The converted microseconds
 */

module.exports.convertSecondsToMicroseconds = function convertSecondsToMicroseconds(timeInSeconds) {
    return (timeInSeconds * 1000 * 1000);
};

/**
 * Converts the input time from milliseconds to microseconds
 * @function convertMillisecondsToMicroseconds
 * @param {Number} timeInMilliseconds The input time(in milliseconds) to be converted
 * @returns {Number} The converted microseconds
 */

module.exports.convertMillisecondsToMicroseconds = function convertMillisecondsToMicroseconds(timeInMilliseconds) {
    return (timeInMilliseconds * 1000);
};

/**
 * Converts the input UTC date to timestamp(in microseconds)
 * @function convertDateToUTCMicroTimeStamp
 * @param {Number} date The input UTC date of the format MM/DD/YYYY hh:mm A
 * @returns {Number} The converted timestamp(in microseconds)
 */

module.exports.convertDateToUTCMicroTimeStamp = function(date) {
    // specify timezone to be UTC and format of the date, convert it to timestamp, then into microseconds
    return ((moment(date + " +0000", "MM/DD/YYYY hh:mm A Z").unix()) * 1000 * 1000);
};

/**
 * Convert the input local date-time to the UTC date-time using the difference in time zones
 * @function convertDateToUTC
 * @param {Number} date The local date-time to convert to UTC date-time
 * @param {Number} zoneDifference The difference in the user's time zone and UTC in minutes
 * @returns {String} The converted UTC date-time
 */
module.exports.convertDateToUTC = function(date, zoneDifference) {
    // convert the zoneDifference into hours and add it to the local date
    return moment(date, 'MM/DD/YYYY hh:mm A').add(zoneDifference / 60, 'hour').format('MM/DD/YYYY hh:mm A');
};

/**
 * Convert the input UTC date-time to the local date-time using the difference in time zones
 * @function convertDateToLocal
 * @param {Number} date The UTC date-time to convert to local date-time
 * @param {Number} zoneDifference The difference in the user's time zone and UTC in minutes
 * @returns {String} The converted local date-time
 */
module.exports.convertDateToLocal = function(date, zoneDifference) {
    // convert the zoneDifference into hours and subtract it from the local date
    return moment(date, 'MM/DD/YYYY hh:mm A').subtract(zoneDifference / 60, 'hour').format('MM/DD/YYYY hh:mm A');
};

/**
 * Convert the input timeStamp to the local date-time using the difference in time zones
 * @function convertDateToLocal
 * @param {Number} date The timeStamp to convert to local date-time
 * @param {Number} zoneDifference The difference in the user's time zone and UTC in minutes
 * @returns {String} The converted local date-time
 */
module.exports.convertTimeStampToLocalDate = function(date, zoneDifference) {
    return moment(date, 'X').subtract(zoneDifference / 60, 'hour').format('MM/DD/YYYY hh:mm A');
};