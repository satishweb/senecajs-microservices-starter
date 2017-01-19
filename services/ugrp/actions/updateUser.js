'use strict';


var response = require(__base + '/sharedlib/utils');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var Joi = require('joi');
var lodash = require('lodash');
var mongoose = require('mongoose');
var Promise = require('bluebird');
var jwt = require('jsonwebtoken');
var microtime = require('microtime');
var User = null;

/**
 * @module updateUser
 */

//Joi validation Schema
// TODO: All joi validations schema should inside joiSchemaValidations.js
var userSchema = Joi.object().keys({
    userId: Joi.string().trim().required(),
    email: Joi.string().regex(/^\s*[\w\-\+​_]+(\.[\w\-\+_​]+)*\@[\w\-\+​_]+\.[\w\-\+_​]+(\.[\w\-\+_]+)*\s*$/),
    firstName: Joi.string().allow('').trim(),
    lastName: Joi.string().allow('').trim(),
    status: Joi.string().trim().valid('offline', 'online', ''),
    avatar: Joi.string().allow('').trim(),
    contactNumber: Joi.string().allow('').trim(),
    companyName: Joi.string().allow('').trim(),
    address: Joi.string().allow('').trim(),
    gender: Joi.string().trim().valid('male', 'female', 'other'), // specify allowed values for gender
    birthDate: Joi.date().format('MM/DD/YYYY').allow(''), // specify date format
    facebookId: Joi.string().allow('').trim()
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
 * Update user details
 * @method updateUser
 * @param {Object} args Used to get the input user details
 * @returns {Promise} Promise containing the updated user details if successful, else containing the appropriate
 * error message
 */
function updateUser(args) {
    return new Promise(function(resolve, reject) {
        args.body = lodash.omitBy(args.body, function(value) {
            return value === null || value === '' || value === {};
        });
        var find = { _id: args.body.userId };
        // removing the Amazon S3 Data URL from the uploaded file path and saving only the key in database.
        if (args.body.avatar) {
            args.body.avatar = response.getUploadedFileKey(args.body.avatar);
        }
        User.findOneAndUpdate(find, args.body, { new: true }, function(err, findResult) {
            if (err || !findResult) {
                reject((err ? { id: 400, msg: err } : { id: 400, msg: 'User id not found.' }));
            } else {
                findResult = JSON.parse(JSON.stringify(findResult));
                delete findResult.password;
                resolve(findResult);
            }
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
        if (result.avatar) {
            result.avatar = response.createUploadedFileURL(result.avatar);
        }
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2000, result, 'User details has been updated successfully.')
        });
    } else {
        //else return error
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
}

/**
 * It updates the user details in the database. User Id is fetched from token, so user can edit only his own profile.
 */
module.exports = function() {
    return function(args, done) {
        User = User || mongoose.model('Users');
        utils.checkInputParameters(args.body, userSchema)
            .then(function() {
                return verifyTokenAndDecode(args);
            })
            .then(function(response) {
                if (!lodash.isEmpty(response.orgId)) {
                    User = mongoose.model('DynamicUser', User.schema, response.orgId + '_users');
                }
                return updateUser(args);
            })
            .then(function(response) {
                delete mongoose.connection.models['DynamicUser'];
                return sendResponse(response, done);
            })
            .catch(function(err) {
                console.log("Error in updateUser ------ ", err);
                delete mongoose.connection.models['DynamicUser'];
                done(null, {
                    statusCode: 200,
                    content: response.error(err.id || 400, err.msg ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};