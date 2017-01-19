'use strict';

var response = require(__base + '/sharedlib/utils'); // what is response here????
var authentication = require(__base + '/sharedlib/authentication');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var InitCompositeGrid = require(__base + '/sharedlib/grid/initCompositeGrid');
var lodash = require('lodash');
var Joi = require('joi');
var mongoose = require('mongoose'); //is this being used here??
var Promise = require('bluebird');
var jwt = require('jsonwebtoken');
var microtime = require('microtime');
var Organization = null;

/**
 * @module fetchOrganization
 */

//Joi validation Schema
//TODO: MOVE
var schemaByFqdn = Joi.object().keys({
    fqdn: Joi.string(),
    orgId: Joi.string()
}).without('fqdn', 'orgId').without('orgId', 'fqdn');

/**
 * Fetch Organization details
 * @method fetchOrganization
 * @param {Object} args Used to get input parameters
 * @returns {Promise} Promise containing created Organization document if successful, else containing
 * the error message
 */
function fetchOrganization(args) {
    return new Promise(function(resolve, reject) {
        var find = null;
        if (args.fqdn) {
            find = { fqdn: args.fqdn };
        }
        if (args.orgId) {
            find = { _id: args.orgId };
        }
        Organization.findOne(find, function(err, findResponse) {
            console.log("Result of fetch ---- ", err, findResponse);
            if (err) {
                reject({ id: 400, msg: err });
            } else {
                if (lodash.isEmpty(findResponse)) {
                    reject({ id: 400, msg: 'Invalid organization.' })
                } else {
                    findResponse = JSON.parse(JSON.stringify(findResponse));
                    resolve(findResponse);
                }
            }
        })
    });
}


/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {String} result The final result to be returned, contains the token created
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result && result.configuration) {
        delete result.configuration;
    }
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2040, result, 'Organization')
        });
    } else {
        //else return error
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
}


function getOrganizationByFqdn(args, done) {
    authentication.checkInputParameters(args.body, schemaByFqdn)
        .then(function() {
            return fetchOrganization(args.body);
        })
        .then(function(response) {
            return sendResponse(response, done);
        })
        .catch(function(err) {
            console.log("Error in fetchOrganization FQDN----- ", err);
            done(null, {
                statusCode: 200,
                content: err.success === true || err.success === false ? err : response.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
            });
        });
}

/********************************************* Fetch Organization by FQDN End ***************************************/


/********************************************* Fetch Organization by ID Start ***************************************/

var schemaById = Joi.object().keys({
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
            } else {
                resolve(decoded);
            }
        });
    });
}

/**
 * Fetch Organization details
 * @method fetchOrgById
 * @param {String}orgId Organisation Id
 * @returns {Promise} Promise containing the Contact details if resolved, else the error message
 */
function fetchOrgById(orgId) {
    return new Promise(function(resolve, reject) {
        Organization.findOne({ _id: orgId, isDeleted: false }, function(err, fetchResponse) {
            if (err) {
                reject({ id: 400, msg: err.message });
            } else {
                // console.log('fetch Contact ---- ', fetchResponse);
                if (lodash.isEmpty(fetchResponse)) {
                    reject({ id: 400, msg: 'Organization not found.' });
                } else {
                    fetchResponse = JSON.parse(JSON.stringify(fetchResponse));
                    resolve(fetchResponse);
                }
            }
        })
    })
}

// /**
//  * Formats the output response and returns the response.
//  * @param result: The final result to return.
//  * @param done: The done method that returns the response.
//  */
// var sendResponse = function (result, done) {
//   if (result !== null) {
//     done(null, {statusCode: 200, content: outputFormatter.format(true, 2040, result, 'Organization')});
//   } else {
//     var error = {id: 400, msg: 'Unexpected error'};
//     done(null, {statusCode: 200, content: response.error(error.id, error.msg, microtime.now())});
//   }
// };

function fetchOrganizationById(args, done) {
    authentication.checkInputParameters(args.body, schemaById)
        .then(function() {
            return verifyTokenAndDecode(args);
        })
        .then(function() {
            return fetchOrgById(args.body.orgId);
        })
        .then(function(response) {
            sendResponse(response, done)
        })
        .catch(function(err) {
            console.log("Error in fetch Organisation ID --- ", err);
            done(null, {
                statusCode: 200,
                content: response.error(err.id || 400, err.msg ? err.msg : 'Unexpected error', microtime.now())
            });
        });
}
/********************************************* Fetch Organization by ID End ****************************************/


/********************************************* Fetch Organization List Start **************************************/


// /**
//  * Verify token and return the decoded token
//  * @method verifyTokenAndDecode
//  * @param {Object} args Used to access the JWT in the header
//  * @returns {Promise} Promise containing decoded token if successful, else containing the error message
//  */
// function verifyTokenAndDecode(args) {
//   return new Promise(function (resolve, reject) {
//     jwt.verify(args.header.authorization, process.env.JWT_SECRET_KEY, function (err, decoded) {
//       if (err) {
//         reject({id: 404, msg: err});
//       } else {
//         resolve(decoded);
//       }
//     });
//   });
// }


// /**
//  * Formats the output response and returns the response.
//  * @param result: The final result to return.
//  * @param done: The done method that returns the response.
//  */
// var sendResponse = function (result, done) {
//   if (result && result.configuration) {
//     delete result.configuration;
//   }
//   if (result !== null) {
//     done(null, {statusCode: 200, content: outputFormatter.format(true, 2040, result, 'Organization')});
//   } else {
//     var error = {id: 400, msg: 'Unexpected error'};
//     done(null, {statusCode: 200, content: response.error(error.id, error.msg, microtime.now())});
//   }
// };

//Joi validation Schema
var schemaList = Joi.object().keys({
    filter: Joi.object(),
    searchKeyword: Joi.object(),
    sort: Joi.object(),
    limit: Joi.number()
});

function getOrganizationList(options, args, done) {
    var seneca = options.seneca;
    var config = {};
    var collection = {
        "orgId": {
            "databaseName": "_id",
            "displayName": "Organization Id",
            "filter": true
        },
        "domain": {
            "displayName": "Domain"
        },
        "website": {
            "displayName": "Website",
            "search": true
        },
        "ownerId": {
            "displayName": "Owner Id",
            "filter": true
        },
        "name": {
            "displayName": "Department Name",
            "search": true,
            "sort": true
        },
        "description": {
            "displayName": "Description"
        },
        "subDomain": {
            "displayName": "Sub Domain"
        },
        'isDeleted': {
            "filter": true,
            "displayName": "Deleted",
            "show": false
        }
    };
    authentication.checkInputParameters(args.body, schemaList)
        .then(function() {
            return verifyTokenAndDecode(args)
        })
        .then(function() {
            config = { 'listOrganization': { 'collections': {} } };
            config.listOrganization.collections['organizations'] = collection;

            if (args.body && args.body.filter && args.body.filter.ownerId) {
                var idArray = [];
                args.body.filter.ownerId.forEach(function(items) {
                    idArray.push(mongoose.Types.ObjectId(items));
                });
                args.body.filter.ownerId = idArray;
            }
            if (args.body.filter) {
                args.body.filter.isDeleted = false;
            } else {
                args.body.filter = {
                    isDeleted: false
                }
            }
            var compositeGrid = InitCompositeGrid.initFromConfigObject(args.body, 'listOrganization', mongoose.connection.db, seneca, config);
            return compositeGrid.fetch()
        })
        .then(function(response) {
            sendResponse(response.data, done)
        })
        .catch(function(err) {
            console.log("Error in fetch Organisation list --- ", err);
            done(null, {
                statusCode: 200,
                content: response.error(err.id || 400, err.msg ? err.msg : 'Unexpected error', microtime.now())
            });
        });
}
/********************************************* Fetch Organization List End ****************************************/



module.exports = function(options) {
    return function(args, done) {
        Organization = Organization || mongoose.model('Organizations');
        // console.log("-------------- getOrganization called ---------------", args.body);
        switch (args.body.action) {
            case 'id':
                delete args.body.action;
                fetchOrganizationById(args, done);
                break;
            case 'fqdn':
                delete args.body.action;
                getOrganizationByFqdn(args, done);
                break;
            case 'list':
                delete args.body.action;
                getOrganizationList(options, args, done);
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