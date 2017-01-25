'use strict';
var lodash = require('lodash');
var Promise = require('bluebird');
var mongoose = require('mongoose');
var jwt = require('jsonwebtoken');

/**
 * Verify token and return the decoded token
 * @method verifyTokenAndDecode
 * @param {Object} args Used to access the JWT in the header
 * @returns {Promise} Promise containing decoded token if successful, else containing the error message
 */
module.exports.verifyTokenAndDecode = function(args) {
    return new Promise(function(resolve, reject) {
        jwt.verify(args.header.authorization, process.env.JWT_SECRET_KEY, function(err, decoded) {
            if (err) {
                reject({ id: 404, msg: err });
            } else if (decoded && decoded.orgId && (decoded.isOwner || decoded.isMicroservice)) {
                resolve(decoded);
            } else {
                reject({ id: 400, msg: "You are not authorized to create a Group." });
            }
        });
    });
};


/**
 * Add users to Group
 * @param Model
 * @param groupId
 * @param userIds
 * @returns {Promise} Promise containing the created Group details if successful, else containing the appropriate
 * error message
 */
module.exports.addUsers = function(Model, groupId, userIds) {
    return new Promise(function(resolve, reject) {
        if (userIds) {
            Model.findOneAndUpdate({_id: groupId}, {$addToSet: {userIds: {$each: userIds}}}, {new: true},
                function (err, updateResponse) {
                    if (err) {
                        reject({id: 400, msg: err});
                    } else {
                        if (lodash.isEmpty(updateResponse)) {
                            reject({id: 400, msg: 'Invalid Group Id'});
                        } else {
                            updateResponse = JSON.parse(JSON.stringify(updateResponse));
                            resolve(updateResponse);
                        }
                    }
                })
        } else {
            resolve();
        }
    });
};

module.exports.addGroupInUser = function(User, groupId, userIds) {
    User.update({ _id: { $in: userIds } }, { $addToSet: { groupIds: groupId } }, { multi: true }, function(err, updateResponse) {
        console.log("Response of addGroupInUser ---- ", err, updateResponse);
    })
};

/**
 * Remove Users from Groups
 * @param Model
 * @param groupId
 * @param userIds
 * @returns {Promise} Promise containing the created group details if successful, else containing the appropriate
 * error message
 */
module.exports.removeUsers = function(Model, groupId, userIds) {
    return new Promise(function(resolve, reject) {
        Model.findOneAndUpdate({ _id: groupId }, { $pull: { userIds: { $in: userIds } } }, function(err, updateResponse) {
            // console.log('args--------- ', err, updateResponse);
            if (err) {
                reject({ id: 400, msg: err });
            } else {
                if (lodash.isEmpty(updateResponse)) {
                    reject({ id: 400, msg: 'Invalid group Id' });
                } else {
                    updateResponse = JSON.parse(JSON.stringify(updateResponse));
                    resolve(updateResponse);
                }
            }
        })
    });
};

module.exports.removeGroupFromUser = function(User, groupId, userIds) {
    User.update({ _id: { $in: userIds } }, { $pull: { groupIds: groupId } }, function(err, updateResponse) {
        console.log("Response of removeGroupFromUser ---- ", err, updateResponse);
    })
};