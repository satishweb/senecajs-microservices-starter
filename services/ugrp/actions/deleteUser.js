'use strict';

var response = require(__base + '/sharedlib/utils');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var authentication = require(__base + '/sharedlib/authentication');
var Joi = require('joi');
var lodash = require('lodash');
var mongoose = require('mongoose');
var Promise = require('bluebird');
var jwt = require('jsonwebtoken');
var microtime = require('microtime');
var User = null;
var Group = null;

//Joi validation Schema
var userSchema = Joi.object().keys({
    userId: Joi.string().required()
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
            } else if (decoded && decoded.orgId && decoded.isOwner) {
                resolve(decoded);
            } else {
                reject({ id: 400, msg: "You are not authorized to delete User." });
            }
        });
    });
}

/**
 * Update user details
 * @method deleteUser
 * @param {Object} args Used to get the input user details
 * @returns {Promise} Promise containing the updated user details if successful, else containing the appropriate
 * error message
 */
function deleteUser(args) {
    return new Promise(function(resolve, reject) {
        User.findOneAndUpdate({ _id: args.userId }, { $set: { isDeleted: true } }, { new: true }, function(err, updateResponse) {
            if (err) {
                reject({ id: 400, msg: err });
            } else {
                updateResponse = JSON.parse(JSON.stringify(updateResponse));
                removeFromGroups(args.userId);
                resolve(updateResponse);
            }
        });
    });
}


function removeFromGroups(userId) {
    return new Promise(function(resolve, reject) {
        Group.update({ userIds: { $in: [userId] } }, { $pull: { userIds: { $in: [userId] } } }, { new: true }, function(err, updateResponse) {
            if (err) {
                reject({ id: 400, msg: err });
            } else {
                updateResponse = JSON.parse(JSON.stringify(updateResponse));
                resolve(updateResponse);
            }
        })
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
        Group = Group || mongoose.model('Groups');

        authentication.checkInputParameters(args.body, userSchema)
            .then(function() {
                return verifyTokenAndDecode(args);
            })
            .then(function(decoded) {
                User = mongoose.model('DynamicUser', User.schema, decoded.orgId + '_users');
                Group = mongoose.model('DynamicGroup', Group.schema, decoded.orgId + '_groups');
                return deleteUser(args.body);
            })
            .then(function(response) {
                delete mongoose.connection.models['DynamicUser'];
                delete mongoose.connection.models['DynamicGroup'];
                sendResponse(response, done);
            })
            .catch(function(err) {
                delete mongoose.connection.models['DynamicUser'];
                delete mongoose.connection.models['DynamicGroup'];
                console.log('err in add organization------- ', err);
                done(null, {
                    statusCode: 200,
                    content: response.error(err.id || 400, err.msg ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};