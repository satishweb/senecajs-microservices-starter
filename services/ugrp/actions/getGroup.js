'use strict';

var response = require(__base + '/sharedlib/utils');
var InitCompositeGrid = require(__base + '/sharedlib/grid/initCompositeGrid');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var jwt = require('jsonwebtoken');
var lodash = require('lodash');
var Joi = require('joi');
var mongoose = require('mongoose');
var Promise = require('bluebird');
var microtime = require('microtime');
var Groups = null;

var getSchema = Joi.object().keys({
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
            } else if (!decoded.orgId) {
                reject({ id: 400, msg: "Invalid token. Org Id not found in token." });
            } else {
                resolve(decoded);
            }
        });
    });
}

/**
 * Fetch Group details
 * @method fetchContacts
 * @returns {Promise} Promise containing the Contact details if resolved, else the error message
 */
function fetchGroup(groupId) {
    return new Promise(function(resolve, reject) {
        Groups.findOne({ '_id': groupId }, function(err, fetchResponse) {
            if (err) {
                reject({ id: 400, msg: err.message });
            } else {
                // console.log('fetch Contact ---- ', fetchResponse);
                if (lodash.isEmpty(fetchResponse)) {
                    reject({ id: 400, msg: 'Group not found.' });
                } else {
                    fetchResponse = JSON.parse(JSON.stringify(fetchResponse));
                    resolve(fetchResponse);
                }
            }
        })
    })
}


/**
 * Fetch Users
 * @method fetchUserDetails
 * @returns {Promise} Promise
 */
function fetchUserDetails(groupId, header, options) {
    return new Promise(function(resolve, reject) {
        var getUser = require(__base + '/actions/getUsers.js')(options);
        getUser({ body: { action: 'list', filter: { groupIds: [groupId] } }, header: header }, function(err, response) {
            if (err) {
                reject(err);
            } else {
                resolve(response.content.data);
            }
        })
    });
}


/**
 * Formats the output response and returns the response.
 * @param result: The final result to return.
 * @param done: The done method that returns the response.
 */
var sendResponse = function(result, done) {
    if (result !== null) {
        done(null, { statusCode: 200, content: outputFormatter.format(true, 2040, result, 'Group') });
    } else {
        var error = { id: 400, msg: 'Unexpected error' };
        done(null, { statusCode: 200, content: response.error(error.id, error.msg, microtime.now()) });
    }
};

function getGroupCalls(options, args, done) {
    var seneca = options.seneca;
    var orgId = null;
    var finalResponse = null;
    // console.log('fetch contact called-----------------', args.body);
    utils.checkInputParameters(args.body, getSchema)
        .then(function() {
            return verifyTokenAndDecode(args);
        })
        .then(function(decoded) {
            orgId = decoded.orgId;
            Groups = mongoose.model('DynamicGroup', Groups.schema, orgId + '_groups');
            return fetchGroup(args.body.groupId);
        })
        .then(function(response) {
            finalResponse = response;
            return fetchUserDetails(args.body.groupId, args.header, options);
        })
        .then(function(response) {
            delete mongoose.connection.models['DynamicGroup'];
            // console.log('response:--- ', JSON.stringify(response));
            var output = {
                content: finalResponse,
                members: response.content,
                permissions: {},
                roles: []
            };
            sendResponse(output, done)
        })
        .catch(function(err) {
            delete mongoose.connection.models['DynamicGroup'];
            console.log("Error in fetch Group --- ", err);
            done(null, {
                statusCode: 200,
                content: response.error(err.id || 400, err.msg ? err.msg : 'Unexpected error', microtime.now())
            });
        });
}

//Joi validation Schema
//TODO: MOVE
var schemaList = Joi.object().keys({
    filter: Joi.object(),
    searchKeyword: Joi.object(),
    sort: Joi.object(),
    limit: Joi.number()
});

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {Object} result The updated user details to return
 * @param {Function} done The done formats and sends the response
 */
function listSendResponse(result, done) {
    if (result !== null) {
        if (result.data && result.data.configuration) {
            delete result.data.configuration;
        }
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2040, result.data, 'Groups')
        });
    } else {
        //else return error
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
}


function listGroupCalls(options, args, done) {
    var seneca = options.seneca;
    var config = {};
    var collection = {
        "groupId": {
            "databaseName": "_id",
            "displayName": "Group Id",
            "filter": true
        },
        "userIds": {
            "displayName": "User Ids",
            "filter": true
        },
        "orgId": {
            "displayName": "Organization Id",
            "search": true
        },
        "ownerId": {
            "displayName": "Owner Id"
        },
        "name": {
            "displayName": "Group Name",
            "search": true,
            "sort": true
        },
        "description": {
            "displayName": "Description"
        }
    };
    utils.checkInputParameters(args.body, schemaList)
        .then(function() {
            return utils.verifyTokenAndDecode(args.header.authorization);
        })
        .then(function(decoded) {
            if (args.body && args.body.filter && args.body.filter.userIds) {
                var idArray = [];
                args.body.filter.userIds.forEach(function(items) {
                    idArray.push(mongoose.Types.ObjectId(items));
                });
                args.body.filter.userIds = idArray;
            }
            config = { 'listGroups': { 'collections': {} } };
            config.listGroups.collections[decoded.orgId + '_groups'] = collection;
            var compositeGrid = InitCompositeGrid.initFromConfigObject(args.body, 'listGroups', mongoose.connection.db, seneca, config);
            return compositeGrid.fetch()
        })
        .then(function(result) {
            listSendResponse(result, done);
        })
        .catch(function(err) {
            console.log("Error in listGroups--- ", err);
            done(null, {
                statusCode: 200,
                content: outputFormatter.format(false, 102)
            });
        });

}


module.exports = function(options) {
    return function(args, done) {
        Groups = Groups || mongoose.model('Groups');

        switch (args.body.action) {
            case 'id':
                delete args.body.action;
                getGroupCalls(options, args, done);
                break;
            case 'list':
                delete args.body.action;
                listGroupCalls(options, args, done);
                break;
            default:
                done(null, {
                    statusCode: 200,
                    content: response.error(400, 'Enter a valid action', microtime.now())
                });
                break;
        }
    };
};