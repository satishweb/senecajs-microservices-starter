'use strict';

var moment = require('moment');
var Promise = require('bluebird');
var jwt = require('jsonwebtoken');
var lodash = require('lodash');
var Joi = require('joi');
var url = require('url');


/**
 * Checks if the input request is received from the APP URL by using the origin received in the header
 * @method checkIfAppUrl
 * @param {String} origin The origin received in the header for the request 
 * @returns {Promise} The Promise is resolved if the origin matches the APP URL, else it is rejected with error message.
 */
module.exports.checkIfAppUrl = function (origin) {
    // console.log("origin ---- ", origin, " app_url ---- ", process.env.APP_URL);
    if (url.parse(origin).host !== process.env.APP_URL) {
        return Promise.reject({id: 2310, msg: "This action is only accessible from the main app URL."});
    } else {
        return Promise.resolve();
    }
}

/**
 * Checks if the input request is received from the APP Domain by using the origin received in the header
 * @method checkIfAppDomain
 * @param {String} origin The origin received in the header for the request 
 * @returns {Promise} The Promise is resolved if the origin matches the APP Domain, else it is rejected with error message.
 */
module.exports.checkIfAppDomain = function (origin) {
    var domain = url.parse(origin).hostname.split('.').slice(-2).join('.');
    console.log("origin ---- ", origin, " app_url ---- ", process.env.DOMAIN, " domain --- ", domain);
    if (domain !== process.env.DOMAIN) {
        return Promise.reject({id: 2310, msg: "This action is only accessible from the main app Domain."});
    } else {
        return Promise.resolve();
    }
}

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
        var key = process.env.JWT_SECRET_KEY; // set the JWT key being used to sign the token
        var options = { expiresIn: process.env.JWT_EXPIRY_TIME }; // set the token expiry time
        var sessionData = { // Extract user details that need to be stored in the JWT token
            firstName: userDetails.firstName,
            lastName: userDetails.lastName,
            // teamId: userDetails.teamId,
            avatar: userDetails.avatar,
            userId: userDetails.userId,
            emailId: userDetails.emails,
            permissions: userDetails.permissions,
            // isOwner: userDetails.isOwner || false,
            accountType: userDetails.accountType,
            lastLoggedInTime: userDetails.lastLoggedInTime
        };
        var tokenData = { // Extract the request header details to be added to the token
            userAgent: requestHeaders['user-agent'],
            origin: userDetails.origin,
            hostIp: requestHeaders['x-forwarded-for'],
            host: requestHeaders.host
        };
        tokenData = lodash.assign(tokenData, sessionData); // merge user details to be added to token and session info
        userDetails.token = jwt.sign(tokenData, key, options); // create the JWT token and add it to the input
        resolve({ output: userDetails, sessionData: sessionData });
    });
};

/**
 * Get the team by matching the request header's origin to team sub-domain.
 * If request is from Postman, returns the sample team from bootstrap.
 * If the fqdn doesn't match with any team's, null is returned.
 * If the corresponding team has been deleted, error message is returned.
 * @method fetchTeamId
 * @param {String|Boolean} teamId The value of team Id or fromSignUp flag
 * @param {Object} header The input headers to get the request origin
 * @param {Seneca} seneca The Seneca instance to call microservice
 * @returns {Promise} Resolved promise containing the team details if the request origin matches a non deleted
 * team or null if no match is found or rejected promise containing the error message.
 */
module.exports.fetchTeamId = function(teamId, header, seneca) {
    var that = this;
    return new Promise(function(resolve, reject) {

        // if teamId is absent and origin is present
        if (!teamId && header && header.origin) {
            header = url.parse(header.origin);
            header = header.host;
            var urlComp = header.split(':'); // remove the trailing port for localhost

            // find the team corresponding to the sub-domain by calling getTeam of teams
            // microservice
            that.microServiceCall(seneca, 'teams', 'getTeam', { action: 'fqdn', fqdn: urlComp[0] }, null,
                function(err, teamResult) {
                    if (err) {
                        resolve(err);
                    } else if (teamResult.content && lodash.isEmpty(teamResult.content.data)) { // if data
                        // returned is empty, team was not found
                        resolve(null);
                    } else if (teamResult.content &&
                        teamResult.content.data &&
                        teamResult.content.data.isDeleted ==
                        false) {
                        // if team details are returned, check if the team has not been deleted and
                        // return the details
                        resolve(teamResult.content.data);
                    } else { // if team has been deleted, return error message
                        reject({
                            id: 400,
                            msg: 'This Team is currently disabled. Please contact Team Admin.'
                        });
                    }
                });
            // }
        } else {
            resolve(null);
        }
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
 * @param {String} errorMsg The error message to be returned in case of invalid token
 * @returns {Promise} Promise containing decoded token if successful, else containing the error message
 */
module.exports.verifyTokenAndDecode = function(token, errorMsg) {
    return new Promise(function(resolve, reject) {
        // use JWT's verify function that verifies the signature and decodes the token
        jwt.verify(token, process.env.JWT_SECRET_KEY, function(err, decoded) {
            if (err) {
                reject({ id: 400, msg: errorMsg || err });
            } else {
                resolve(decoded);
            }
        });
    });
};

/**
 * Check if user is authorized
 * @method checkIfAuthorized
 * @param {String} decodedToken The decoded JWT token from the header
 * @param {Boolean} subDomainsOnly Flag for whether teamId is needed in token
 * @returns {Promise} Resolved Promise if successful, else containing the error message
 */
module.exports.checkIfAuthorized = function (decodedToken, isApiKey, subDomainsOnly) {
        if (decodedToken && (decodedToken.isMicroservice || decodedToken.isOwner || (isApiKey && decodedToken.isApiKey))) {    // if the decoded token belongs to an owner, resolve the
            // decoded token
            if (subDomainsOnly === true) {
                if (decodedToken.teamId) {
                    return Promise.resolve();                    
                } else {
                    return Promise.reject({ id: 400, msg: "This action can only be performed from a sub-domain."});
                }
            } else {
                return Promise.resolve();
            }
        } else {    // else return unauthorized message
            return Promise.reject({ id: 400, msg: "You are not authorized to perform this action." });
        }
}

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
module.exports.microServiceCall = function (seneca, role, cmd, body, header, callback) {
    console.log("In utils microservice call ----- ");
    seneca.client({
        type: 'amqp',
        pin: ['role:' + role, 'cmd:' + cmd].join(','),
        host: process.env.QUEUE_HOST || '127.0.0.1'
    }).act({
        role: role,
        cmd: cmd,
        body: body,
        header: header,
        fatal$: false // treat errors as non-fatal
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
module.exports.microServiceCallPromise = function(seneca, role, cmd, body, header, isRejected, credentials) {
    return new Promise(function(resolve, reject) {
        seneca.client({
            type: 'amqp',
            pin: ['role:' + role, 'cmd:' + cmd].join(','),
            host: process.env.QUEUE_HOST || '127.0.0.1'
        }).act({
            role: role,
            cmd: cmd,
            body: body,
            credentials: credentials,
            header: header,
            fatal$: false // treat errors as non-fatal
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
 * Prints the formatted seneca logs with the microservice name, file name and message
 * @function senecaLog
 * @param {seneca} seneca The seneca instance
 * @param {String} type The type of seneca log(info, error, debug)
 * @param {String} file The name of the file
 * @param {String} msg The message to be printed
 */
module.exports.senecaLog = function(seneca, type, file, msg) {
    seneca.log[type]('[ ' + process.env.SRV_NAME + ' : ' + file + ' ]', msg);
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