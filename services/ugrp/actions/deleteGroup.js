'use strict';

var response = require(__base + '/sharedlib/utils');
var authentication = require(__base + '/sharedlib/authentication');
var groupsLib = require(__base + '/lib/groups');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var mongoose = require('mongoose');
var Promise = require('bluebird');
var jwt = require('jsonwebtoken');
var microtime = require('microtime');
var Group = null;
var User = null;
var Contact = null;
/**
 * @module deleteGroup
 */

//Joi validation Schema
var GroupSchema = Joi.object().keys({
    groupId: Joi.string().required()
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
                reject({ id: 400, msg: "You are not authorized to delete a Group." });
            }
        });
    });
}


/**
 * Delete Group
 * @method deleteGroup
 * @param {String} groupId Group Id
 * @returns {Promise} Promise containing the created Group details if successful, else containing the appropriate
 * error message
 */
function deleteGroup(groupId) {
    return new Promise(function(resolve, reject) {
        Group.remove({ _id: groupId }, function(err, response) {
            if (err) {
                reject({ id: 400, msg: err });
            } else {
                resolve(response);
            }
        })
    });
}


/**
 * Fetch Group details
 * @method fetchGroup
 * @param {String}groupId Group Id
 * @returns {Promise} Promise containing the created Group details if successful, else containing the appropriate
 * error message
 */
function fetchGroup(groupId) {
    return new Promise(function(resolve, reject) {
        Group.findOne({ _id: groupId }, function(err, findResponse) {
            if (err) {
                reject({ id: 400, msg: err });
            } else {
                if (lodash.isEmpty(findResponse)) {
                    reject({ id: 400, msg: "Invalid Group Id" });
                } else if (findResponse.name == 'users') {
                    reject({ id: 400, msg: "Cannot delete users Group" });
                } else {
                    findResponse = JSON.parse(JSON.stringify(findResponse));
                    resolve(findResponse);
                }
            }
        })
    });
}

/**
 * @method removeGroupId
 * @param groupId
 * @param userIds
 * @param header
 * @param seneca
 */
function removeGroupId(groupId) {
    return new Promise(function(resolve, reject) {
        User.update({ groupIds: { $in: [groupId] } }, { $pull: { groupIds: { $in: [groupId] } } }, { new: true }, function(err, updateResponse) {
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
 * @param {Object} result The updated Group details to return
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2060, result, 'Group')
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
    return function(args, done) {
        User = User || mongoose.model('Users');
        Group = Group || mongoose.model('Groups');
        var orgId = null;
        authentication.checkInputParameters(args.body, GroupSchema)
            .then(function() {
                return verifyTokenAndDecode(args);
            })
            .then(function() {
                return fetchGroup(args.body.groupId);
            })
            .then(function(response) {
                removeGroupId(response.groupId, response.userIds, args.header, seneca);
                return deleteGroup(args.body.groupId);
            })
            .then(function(response) {
                delete mongoose.connection.models['DynamicGroup'];
                delete mongoose.connection.models['DynamicUser'];
                sendResponse(response, done);
            })
            .catch(function(err) {
                delete mongoose.connection.models['DynamicGroup'];
                delete mongoose.connection.models['DynamicUser'];
                console.log('err in delete Group---- ', err);
                done(null, {
                    statusCode: 200,
                    content: response.error(err.id || 400, err.msg ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};