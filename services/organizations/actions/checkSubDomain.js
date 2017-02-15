'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter.js');
var outputFormatter = new Locale(__base);
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var Organization = null;

/**
 * @module checkSubDomain
 */

//Joi validation Schema
var schema = Joi.object().keys({
    subDomain: Joi.string().required()
});

/**
 * Check if sub-domain is not already in use
 * @method checkIfSubDomainPresent
 * @param {String} subDomain
 * @returns {Promise} Promise containing true/false if successful, else containing
 * the error message
 */
function checkIfSubDomainPresent(subDomain) {
    return new Promise(function(resolve, reject) {
        Organization.findOne({ where: { subDomain: subDomain } })
            .then(function(findResponse) {
                if (lodash.isEmpty(findResponse)) {
                    resolve({ present: false })
                } else {
                    resolve({ present: true })
                }
            })
            .catch(function (err) {
                reject({id: 400, msg: err});
            })
    })
}

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {String} result The final result to be returned, contains the token created
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2000, result, result.present == true ? 'Sub-Domain Present' : 'Sub-Domain Not Present')
        });
    } else {
        //else return error
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
}


module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function(args, done) {
        Organization = Organization || dbConnection.models. organizations;

        utils.checkInputParameters(args.body, schema)
            .then(function() {
                return utils.checkIfAuthorized(args.credentials);
            })
            .then(function() {
                return checkIfSubDomainPresent(args.body.subDomain);
            })
            .then(function(response) {
                return sendResponse(response, done);
            })
            .catch(function(err) {
                console.log('err in check sub domain--- ', err);

                // in case of error, print the error
                utils.senecaLog(seneca, 'error', __filename.split('/').pop(), err);

                // if the error message is formatted, send it as reply, else format it and then send
                done(null, {
                    statusCode: 200,
                    content: err.success === true || err.success === false ? err : utils.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};