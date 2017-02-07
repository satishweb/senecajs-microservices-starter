'use strict';

var mongoose = require('mongoose');
var utils = require(__base + '/sharedlib/utils');
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
 * @module getUsers
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
 * Get the user details corresponding to the user Id
 * @param {Number} userId The id of the user whose details are to be fetched
 * @returns {Promise} Promise containing the user details if successful or the error message if unsuccessful
 */
function getUser(userId, orgId) {
    return new Promise(function(resolve, reject) {
        User.findOne({ userId: userId, isDeleted: false })
            .then( function(result) {
                if (lodash.isEmpty(result)) {
                    reject({ id: 400, msg: "User not found." });
                } else {
                    delete result.password;
                    resolve(result);
                }
            })
            .catch(function (err) {
                reject({ id: 400, msg: err.message }); 
            })
    });
};

/**
 * Fetches the paginated list of users who match the search/filter criteria.
 * @param {Object} input The input containing the search, filter, sort, page and limit fields
 * @param {Object} orgId The Id of the organization for which the users are to be fetched
 * @returns {Promise} Promise containing the result returned by Grid library
 */
function listUsers(input, orgId) {
    var compositeGrid;
    var collection = {
        "userId": {
            "databaseName": "userId",
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
        "orgId": {
            "displayName": "Organization Id",
            "filter": true
        }
    };
    var config = { 'listUsers': { 'collections': {} }};
    config.listUsers.collections['users'] = collection;
    delete input.action;
    if (orgId) {
        input.orgId = orgId;
    }
    compositeGrid = InitCompositeGrid.initFromConfigObject(input, 'listUsers', User, null, config);
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
 * It fetches a single user corresponding to the user Id or a list of users based on the search criteria
 */
module.exports = function(options) {
    var seneca = options.seneca;
    var ontology = options.wInstance;
    return function(args, done) {
        console.log("----------- Get users called -----------");
        User = User || ontology.collections.users;
        utils.checkInputParameters(args.body, userGetSchema)
            .then(function() {
                return utils.verifyTokenAndDecode(args.header.authorization)
            })
            .then(function(decoded) {
                switch (args.body.action) {
                    case 'list':
                        // console.log("Is List called ---- ");
                        return listUsers(args.body, decoded.orgId);
                        break;
                    case 'id':
                        // console.log("Get called ----- ");
                        return getUser(args.body.userId, decoded.orgId);
                        break;
                    default:
                        return new Promise(function(resolve, reject) {
                            reject({ id: 400, msg: "Invalid input. \"action\" must be present and one of [\"id\", \"list\"]" });
                        });
                }
            })
            .then(function(result) {
                sendResponse(result, done);
            })
            .catch(function(err) {
                console.log("Error in getUsers ---- ", err);
                var error;
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