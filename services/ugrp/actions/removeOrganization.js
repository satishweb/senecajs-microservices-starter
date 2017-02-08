'use strict';

var response = require(__base + '/sharedlib/utils');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var Promise = require('bluebird');
var microtime = require('microtime');
var User = null;

/**
 * @module removeOrganization
 */

//Joi validation Schema
//TODO: move scheme
var userSchema = Joi.object().keys({
    userId: Joi.array().items(Joi.string().required()).required(),
    orgId: Joi.string().required()
});

/**
 * Update user details
 * @method updateUser
 * @param {Object} input Used to get the input user details
 * @returns {Promise} Promise containing the updated user details if successful, else containing the appropriate
 * error message
 */
function updateUser(input) {
    return new Promise(function (resolve, reject) {
       User.findOne({ userId: input.userId }, { select: [ownedOrgIds] })
            .then(function (user) {
                var orgIds = user.ownedOrgIds;
                orgIds = lodash.pull(orgIds, input.orgId);   
                return User.update({ userId: input.userId }, { ownerOrgIds: orgIds })
            })
            .then(function (updateResponse) {
                resolve(updateResponse);
            })
            .catch(function (err) {
                reject({ id: 400, msg: err });
            });
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


module.exports = function (options) {
    var seneca = options.seneca;
    var ontology = options.wInstance;
    return function(args, done) {
        User = User || ontology.collections.users;
        utils.checkInputParameters(args)
            .then(function() {
                return utils.verifyTokenAndDecode(args);
            })
            .then(function(response) {
                return updateUser(args.body);
            })
            .then(function(response) {
                sendResponse(response, done);
            })
            .catch(function(err) {
                console.log('err in remove organization------- ', err);
                done(null, {
                    statusCode: 200,
                    content: response.error(err.id || 400, err.msg ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};