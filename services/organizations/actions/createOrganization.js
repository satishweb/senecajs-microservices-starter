'use strict';

var response = require(__base + '/sharedlib/utils'); // what is this response???
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var lodash = require('lodash');
var Joi = require('joi');
var mongoose = require('mongoose');
var Promise = require('bluebird');
var jwt = require('jsonwebtoken');
var microtime = require('microtime');

var utils = require(__base + '/sharedlib/utils'); // is this being used here????
var Organization = null;

/**
 * @module createOrganization
 */

//Joi validation Schema
//TODO: MOVE
var schema = Joi.object().keys({
    name: Joi.string().required(),
    website: Joi.string().regex(/^(http\:\/\/|https\:\/\/)?([a-zA-Z0-9][a-z0-9\-]*\.)+[a-zA-Z0-9][a-zA-Z0-9\-]*/),
    description: Joi.string(),
    subDomain: Joi.string().required()
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
                reject({ id: 400, msg: "You are not authorized to create an organization." });
            }
        });
    });
}

/**
 * Save Organization details in database
 * @method createOrganization
 * @param {Object} input Used to input parameters
 * @param {String} ownerId Used to Id of user
 * @returns {Promise} Promise containing created Organization document if successful, else containing
 * the error message
 */
function createOrganization(ownerId, input) {
    return new Promise(function(resolve, reject) {
        var data = {
            ownerId: ownerId,
            fqdn: input.subDomain + '.' + process.env.DOMAIN
        };
        data = lodash.assign(data, input);
        console.log("Data ----- ", data);
        var newOrganization = new Organization(data);
        newOrganization.save(function(err, saveResponse) {
            if (err) {
                if (err.code === 11000) {
                    reject({ id: 400, msg: "Sub Domain already exists." });
                } else {
                    reject({ id: 400, msg: err.message || err });
                }
            } else {
                saveResponse = JSON.parse(JSON.stringify(saveResponse));
                resolve(saveResponse);
            }
        })
    });
}

function createGenGroup(header, seneca) {
    utils.microServiceCall(seneca, 'groups', 'createGroup', { name: 'users' }, header, null);
}

function addToUserOrg(orgId, userId, header, seneca) {
    utils.microServiceCall(seneca, 'users', 'addOrganization', { userId: userId, orgId: orgId }, header, null);
}

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {String} result The final result to be returned, contains the token created
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2030, result, 'Organization')
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
        Organization = Organization || mongoose.model('Organizations');
        if (args.body.name) {
            args.body.name = args.body.name.toLowerCase();
        }
        utils.checkInputParameters(args.body, schema)
            .then(function() {
                return verifyTokenAndDecode(args);
            })
            .then(function(response) {
                return createOrganization(response.userId, args.body);
            })
            .then(function(response) {
                var data = {
                    isMicroservice: true,
                    orgId: response.orgId,
                    isOwner: true
                };
                var header = utils.createMsJWT(data);
                createGenGroup(header, seneca);
                addToUserOrg(response.orgId, response.ownerId, header, seneca);
                return sendResponse(response, done);
            })
            .catch(function(err) {
                console.log('err in create organization--- ', err);
                done(null, {
                    statusCode: 200,
                    content: err.success === true || err.success === false ? err : response.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};