'use strict';

var moment = require('moment');
var Promise = require('bluebird');


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
 * @returns {Promise} The Promise containing the action response in case of success and null in case of failure
 */
module.exports.microServiceCallPromise = function(seneca, role, cmd, body, header) {
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
                resolve(null);
            } else {
                resolve(response);
            }
        });
    });
};

// TODO: Merge with above function and add a parameter
/**
 * Generic MicroService call with resolve and reject Promise
 * @method microServiceCallPromise
 * @param {Seneca} seneca Seneca instance
 * @param {String} role MicroService name for seneca call
 * @param {String} cmd Action name for seneca call
 * @param {Object} body The input sent to the action
 * @param {Object} header The Header sent to the action
 * @returns {Promise} The Promise resolved with the action response in case of success and rejected with the error
 * in case of failure
 */
module.exports.microServiceCallWithReject = function(seneca, role, cmd, body, header) {
    return new Promise(function(resolve, reject) {
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
                reject(err);
            } else {
                resolve(response);
            }
        });
    });
};

/**
 * @method 
 * @param seneca
 * @param type
 * @param file
 * @param msg
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