'use strict';

var response = require(__base + '/sharedlib/utils');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var mongoose = require('mongoose');
var Promise = require('bluebird');
var jwt = require('jsonwebtoken');
var microtime = require('microtime');
var User = null;

/**
 * @module removeOrganization
 */

//Joi validation Schema
//TODO: move scheme
var userSchema = Joi.object().keys({
    userId: Joi.array().items(Joi.string().required()).required(),
    orgId: Joi.string().required()
});

/**
 * Check input parameter using Joi
 * @method checkInputParameters
 * @param {Object} args Used to get the input parameters to validate
 * @returns {Promise} Promise containing true if input validated successfully, else containing the error message
 */
function checkInputParameters(args) {
    return new Promise(function(resolve, reject) {
        Joi.validate(args.body, userSchema, function(err) {
            if (err) {
                reject({ id: 400, msg: err.details[0].message });
            } else {
                resolve(true);
            }
        });
    });
}

/**
 * Verify token and return the decoded token
 * @method verifyTokenAndDecode
 * @param {Object} args Used to access the JWT in the header
 * @returns {Promise} Promise containing decoded token if successful, else containing the error message
 */
function verifyTokenAndDecode(args) {
    return new Promise(function(resolve, reject) {
        jwt.verify(args.header.authorization, process.env.JWT_SECRET_KEY, function(err, decoded) {
            if (err) {
                reject({ id: 404, msg: err });
            } else {
                resolve(decoded);
            }
        });
    });
}

/**
 * Update user details
 * @method updateUser
 * @param {Object} args Used to get the input user details
 * @returns {Promise} Promise containing the updated user details if successful, else containing the appropriate
 * error message
 */
function updateUser(args) {
    return new Promise(function(resolve, reject) {
        User.update({ _id: args.userId }, { $pull: { orgIds: args.orgId } }, { new: true }, function(err, updateResponse) {
            if (err) {
                reject({ id: 400, msg: err });
            } else {
                updateResponse = JSON.parse(JSON.stringify(updateResponse));
                resolve(updateResponse);
            }
        });
    });
}


/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {Object} result The updated user details to return
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2050, result, 'User')
        });
    } else {
        //else return error
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
}


module.exports = function() {
    return function(args, done) {
        User = User || mongoose.model('Users');
        checkInputParameters(args)
            .then(function() {
                return verifyTokenAndDecode(args);
            })
            .then(function(response) {
                return updateUser(args.body);
            })
            .then(function(response) {
                sendResponse(response, done);
            })
            .catch(function(err) {
                console.log('err in remove organization------- ', err);
                done(null, {
                    statusCode: 200,
                    content: response.error(err.id || 400, err.msg ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};