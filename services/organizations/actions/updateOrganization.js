'use strict';

var response = require(__base + '/sharedlib/utils'); //what is response here???
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var mongoose = require('mongoose');
var Promise = require('bluebird');
var jwt = require('jsonwebtoken');
var microtime = require('microtime');
var Organization = null;

/**
 * @module updateOrganization
 */

//Joi validation Schema
//TODO: MOVE
var OrganizationSchema = Joi.object().keys({
    orgId: Joi.string().required(),
    name: Joi.string(),
    subDomain: Joi.string(),
    description: Joi.string().allow(''),
    ownerId: Joi.string(),
    website: Joi.string().regex(/^$|^(http\:\/\/|https\:\/\/)?([a-zA-Z0-9][a-z0-9\-]*\.)+[a-zA-Z0-9][a-zA-Z0-9\-]*/).allow('')
});

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
            } else if (decoded && decoded.isOwner) {
                resolve(decoded);
            } else {
                reject({ id: 400, msg: "You are not authorized to update an organization." });
            }
        });
    });
}


/**
 * Update Organization details
 * @method updateOrganization
 * @param {Object}args input parameters
 * @returns {Promise} Promise containing the created Organization details if successful, else containing the appropriate
 * error message
 */
function updateOrganization(args) {
    return new Promise(function(resolve, reject) {
        var updateData = lodash.omitBy(args, function(value) {
            return value === null || value === {};
        });
        delete updateData.orgId;
        Organization.findOneAndUpdate({ _id: args.orgId }, updateData, { new: true }, function(err, updateResponse) {
            if (err) {
                if (err.code === 11000) {
                    reject({ id: 400, msg: "Sub Domain already exists." });
                } else {
                    reject({ id: 400, msg: err.message || err });
                }
            } else {
                if (lodash.isEmpty(updateResponse)) {
                    reject({ id: 400, msg: 'Invalid Organization Id' });
                } else {
                    updateResponse = JSON.parse(JSON.stringify(updateResponse));
                    resolve(updateResponse);
                }
            }
        });
    });
}

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {Object} result The updated Organization details to return
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2050, result, 'Organization')
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
        Organization = Organization || mongoose.model('Organizations');
        if (args.body.name) {
            args.body.name = args.body.name.toLowerCase();
        }
        utils.checkInputParameters(args.body, OrganizationSchema)
            .then(function() {
                return verifyTokenAndDecode(args);
            })
            .then(function() {
                return updateOrganization(args.body);
            })
            .then(function(response) {
                sendResponse(response, done);
            })
            .catch(function(err) {
                console.log('err in update organization---- ', err);
                done(null, {
                    statusCode: 200,
                    content: response.error(err.id || 400, err.msg ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};