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
 * @module deleteOrganization
 */

//Joi validation Schema
var OrganizationSchema = Joi.object().keys({
    orgId: Joi.string().required()
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
                reject({ id: 400, msg: "You are not authorized to delete an organization." });
            }
        });
    });
}


/**
 * Update Organization details to isDeleted to true
 * @method deleteOrganization
 * @param {String}orgId Organization Id
 * @returns {Promise} Promise containing the created Organization details if successful, else containing the appropriate
 * error message
 */
function deleteOrganization(orgId) {
    return new Promise(function(resolve, reject) {
        Organization.findOneAndUpdate({ _id: orgId }, { 'isDeleted': true }, { new: true }, function(err, updateResponse) {
            if (err) {
                reject({ id: 400, msg: err });
            } else {
                if (lodash.isEmpty(updateResponse)) {
                    reject({ id: 400, msg: "Invalid Organization Id" });
                } else {
                    updateResponse = JSON.parse(JSON.stringify(updateResponse));
                    resolve(updateResponse);
                }
            }
        })
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
            content: outputFormatter.format(true, 2060, result, 'Organization')
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
        utils.checkInputParameters(args.body, OrganizationSchema)
            .then(function() {
                return verifyTokenAndDecode(args);
            })
            .then(function() {
                return deleteOrganization(args.body.orgId);
            })
            .then(function(response) {
                sendResponse(response, done);
            })
            .catch(function(err) {
                console.log('err in delete Organization---- ', err);
                done(null, {
                    statusCode: 200,
                    content: response.error(err.id || 400, err.msg ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};