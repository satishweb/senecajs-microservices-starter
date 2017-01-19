'use strict';

var mongoose = require('mongoose');
var response = require(__base + '/sharedlib/utils');
var InitCompositeGrid = require(__base + '/sharedlib/grid/initCompositeGrid');
var Joi = require('joi');
var jwt = require('jsonwebtoken');
var lodash = require('lodash');
var Locale = require(__base + '/sharedlib/formatter.js');
var outputFormatter = new Locale(__base);
var Promise = require('bluebird');
var microtime = require('microtime');
var User = null;

/**
 * @module post
 */

// create Joi schema
//TODO: move this
var userGetSchema = Joi.object().keys({
    action: Joi.string().trim().allow('list', 'id'),
    userId: Joi.any().when('action', { is: 'id', then: Joi.string().trim().required(), otherwise: Joi.any().forbidden() }),
    searchKeyword: Joi.any().when('action', { is: 'list', then: Joi.object(), otherwise: Joi.any().forbidden() }),
    filter: Joi.any().when('action', { is: 'list', then: Joi.object(), otherwise: Joi.any().forbidden() }),
    sort: Joi.any().when('action', { is: 'list', then: Joi.object(), otherwise: Joi.any().forbidden() }),
    limit: Joi.any().when('action', { is: 'list', then: Joi.number(), otherwise: Joi.any().forbidden() })
}).without('userId', ['searchKeyword', 'filter', 'sort', 'limit']);

/**
 * Verify token and return the decoded token
 * @method verifyTokenAndDecode
 * @param {Object} token Used to access the JWT in the header
 * @returns {Promise} Promise containing decoded token if successful, else containing the error message
 */
function verifyTokenAndDecode(token) {
    return new Promise(function(resolve, reject) {
        console.log("token ----- ", token);
        jwt.verify(token, process.env.JWT_SECRET_KEY, function(err, decoded) {
            if (err) {
                reject({ id: 404, msg: err });
            } else {
                resolve(decoded);
            }
        });
    });
}

var getUser = function(userId) {
    return new Promise(function(resolve, reject) {
        User.findOne({ _id: userId }, function(err, result) {
            // console.log("fetch result --- ", err, result);
            if (err) {
                reject({ id: 400, msg: err.message });
            } else if (lodash.isEmpty(result)) {
                reject({ id: 400, msg: "User not found." });
            } else {
                result = JSON.parse(JSON.stringify(result));
                delete result.password;
                resolve(result);
            }
        });
    });
};

var getOwners = function(input, result) {
    return new Promise(function(resolve) {
        // console.log(input.action === 'list', input.filter.userId, result.data.pagination.total < input.filter.userId.length);
        if (input.filter && input.filter.userId && result.data.pagination && result.data.pagination.total < input.filter.userId.length) {
            console.log("Inside if ------ ");
            listUsers(input, null)
                .then(function(response) {
                    // console.log("Response of getOwner ---- ", JSON.stringify(response));
                    if (!lodash.isEmpty(response.data.content)) {
                        response.data.content.forEach(function(owner) {
                            result.data.content.push(owner);
                        });
                        result.data.pagination.total = response.data.pagination.total;
                    }
                    resolve(result);
                })
                .catch(function(err) {
                    console.log("Error in getOwner ---- ", err);
                    resolve(result)
                });
        } else {
            console.log("Inside else ----- ");
            resolve(result);
        }
    });
};

var listUsers = function(input, orgId) {
    var compositeGrid;
    var collection = {
        "userId": {
            "databaseName": "_id",
            "displayName": "User Id",
            "filter": true
        },
        "avatar": {
            "displayName": "Avatar"
        },
        "firstName": {
            "displayName": "First Name",
            "search": true,
            "sort": true
        },
        "lastName": {
            "displayName": "Last Name",
            "search": true
        },
        "email": {
            "displayName": "Email",
            "filter": true,
            "search": true,
            "sort": true
        },
        "groupIds": {
            "displayName": "Group Ids",
            "filter": true
        },
        "status": {
            "displayName": "Status"
        }
    };
    var config = { 'listUsers': { 'collections': {} } };
    delete input.action;
    if (input && input.filter) {
        if (input.filter.userId && lodash.isArray(input.filter.userId)) {
            var convertedUserIds = [];
            input.filter.userId.forEach(function(id) {
                convertedUserIds.push(mongoose.Types.ObjectId(id));
            });
            input.filter.userId = convertedUserIds;
        }
        // console.log("groupId type ----- ", typeof input.filter.groupIds);
        if (input.filter.groupIds && lodash.isArray(input.filter.groupIds)) {
            var convertedGroupIds = [];
            input.filter.groupIds.forEach(function(id) {
                convertedGroupIds.push(mongoose.Types.ObjectId(id));
            });
            input.filter.groupIds = convertedGroupIds;
        }
    }
    if (orgId) {
        config.listUsers.collections[orgId + '_users'] = collection;
    } else {
        config.listUsers.collections['users'] = collection;
    }
    compositeGrid = InitCompositeGrid.initFromConfigObject(input, 'listUsers', mongoose.connection.db, null, config);
    return compositeGrid.fetch()
};

/**
 * Formats the output response and returns the response.
 * @function sendResponse
 * @param {Object} result - The final result to return.
 * @param {Function} done - the done formats and sends the response.
 *
 */
var sendResponse = function(result, done) {
    if (result !== null) {
        // console.log("Returning user ---- ", result);
        if (result && result.data) {
            result = result.data;
            if (result.configuration) {
                delete result.configuration;
            }
            if (!lodash.isEmpty(result.content)) {
                result.content.forEach(function(user) {
                    delete user.groupIds;
                });
            }
        }
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2040, result, "Users")
        });
    } else {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 1060, null, "Users")
        });
    }
};


/**
 * This is a POST action for the User microservice
 */
module.exports = function(options) {

    // options = options || {};
    // var seneca = options.seneca;
    return function(args, done) {
        // console.log("Get Channel called -----", args.body);
        User = mongoose.model('Users');
        // if input contains email id, convert it to lowercase
        utils.checkInputParameters(args.body, userGetSchema)
            .then(function() {
                console.log("Header ------ ", args.header.authorization);
                return verifyTokenAndDecode(args.header.authorization)
            })
            .then(function(decoded) {
                switch (args.body.action) {
                    case 'list':
                        // console.log("Is List called ---- ");
                        return listUsers(args.body, decoded.orgId);
                        break;
                    case 'id':
                        // console.log("Get called ----- ");
                        if (decoded.orgId) {
                            User = mongoose.model('DynamicUser', User.schema, decoded.orgId + '_users');
                        }
                        return getUser(args.body.userId);
                        break;
                    default:
                        return new Promise(function(resolve, reject) {
                            reject({ id: 400, msg: "Invalid input. \"action\" must be present and one of [\"id\", \"list\"]" });
                        });
                }
            })
            .then(function(result) {
                // console.log("Result ----- ", JSON.stringify(result), result.data.pagination.total, args.body.filter.userId.length, result.data.pagination.total < args.body.filter.userId.length);
                return getOwners(args.body, result);
            })
            .then(function(result) {
                // console.log("Result of getUsers ----- ", JSON.stringify(result));
                delete mongoose.connection.models['DynamicUser'];
                sendResponse(result, done);
            })
            .catch(function(err) {
                console.log("Error in getUsers ---- ", err);
                var error;
                delete mongoose.connection.models['DynamicUser'];
                if (err && 'success' in err) {
                    error = err;
                } else {
                    error = err ? { id: err.id || 1000, msg: JSON.stringify(err.msg) || err.message || "Unexpected error" } : { id: 1000, msg: "Unexpected error" };
                    error = outputFormatter.format(false, 1000, null, error.msg);
                }
                done(null, {
                    statusCode: 200,
                    content: error
                });
            });
    };
};