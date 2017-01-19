'use strict';

var Locale = require('./formatter');
var utils = require('./utils');
var authentication = require('./authentication');
var outputFormatter = new Locale(__dirname + '/../');
var lodash = require('lodash');
var Joi = require('joi');
var mongoose = require('mongoose');
var Promise = require('bluebird');
var bcrypt = require('bcrypt');
var jwt = require('jsonwebtoken');
var microtime = require('microtime');


/**
 * Check if user is already present in Database
 * @method checkIfAlreadyPresent
 * @param {Object} User Used to get the mongoose connection object
 * @param {Object} input Used to get the input parameters
 * @param {Object} flag Boolean value whether to create new document(flag = false) or update existing document(flag = true)
 * @param {Function} done The callback to format and send the response
 * @returns {Promise} Promise containing the user details if successful, else the appropriate error message
 */
module.exports.checkIfAlreadyPresent = function(User, input, flag, done) {
    return new Promise(function(resolve, reject) {
        var find = {}; // object for search query parameters
        var temp = []; // array for or queries in find
        switch (input.signUpType) {
            case 'email': // checking if signUpType is email then setting email as find query parameter
                find.email = input.email;
                break;
            case 'google': // checking if signUpType is google then setting email returned
                // by google and googleId as find query parameter
                temp.push({ 'googleId': input.socialId });
                input.socialEmail ? temp.push({ 'email': input.socialEmail }) : null;
                find = { $or: temp };
                break;
            case 'linkedIn': // checking if signUpType is linkedIn then setting email returned
                // by linkedIn and linkedInId as find query parameter
                temp.push({ 'linkedInId': input.socialId });
                input.socialEmail ? temp.push({ 'email': input.socialEmail }) : null;
                find = { $or: temp };
                break;
            case 'facebook':
                temp.push({ 'facebookId': input.socialId });
                input.socialEmail ? temp.push({ 'email': input.socialEmail }) : null;
                find = { $or: temp };
                break;
        }
        // fetch user if present in database
        if (lodash.isEmpty(find)) {
            reject(outputFormatter.format(false, 1020, 'input'));
        } else {
            User.find(find, function(err, findResult) {
                if (err) {
                    reject({ id: 400, msg: err });
                } else {
                    // if no user is found, can continue with sign up
                    if (lodash.isEmpty(findResult)) {
                        resolve([{}, flag]);
                    } else {
                        // if user is found, checking if the social email matches the email in database.
                        // if yes, will update the user's profile by adding the social info to it and linking with his social account
                        if (input.socialEmail !== undefined && findResult[0].email === input.socialEmail) { // checking if
                            // emailId from social account is same as found in find result
                            flag = true; // setting flag to true to merge account later
                            findResult[0] = JSON.parse(JSON.stringify(findResult[0]));
                            resolve([findResult[0], flag]);
                        } else {
                            done(null, {
                                statusCode: 200,
                                content: outputFormatter.format(false, 2300, null, findResult[0].email || 'User')
                            });
                        }
                    }
                }
            });
        }
    });
};

/**
 * Create the user object to be saved, by merging defaults with data provided in input or fetched from database
 * @method createSaveData
 * @param {Object} input Contains the input data
 * @param {Object} findResult Contains the user data fetched from the database
 * @returns {Promise} Promise containing the user data to save
 */
module.exports.createSaveData = function(input, findResult) {
    return new Promise(function(resolve) {
        var temp = {}; // temporary object created from input parameters to be merged with with default user object
        var data = { // default user object
            firstName: null,
            lastName: null,
            avatar: null,
            email: null,
            accountType: null,
            password: null,
            googleId: null,
            linkedInId: null,
            facebookId: null,
            lastLoggedInTime: null,
            passwordStatus: "passwordNotSet",
            facebookChannelSet: false
        };
        if (input.signUpType === 'email') { // if type is email, set email related fields
            temp = {
                email: input.email,
                accountType: input.accountType,
                firstName: input.name,
                lastLoggedInTime: microtime.now()
            };
            data = lodash.merge(data, temp); // merge the defaults with the object created from inputs
            resolve(data);
        } else if (input.signUpType === 'google' || input.signUpType === 'linkedIn' || input.signUpType === 'facebook') { // if type is social sign up
            if (input.signUpType === 'facebook')
                temp.facebookChannelSet = true;

            var key = input.signUpType + 'Id';
            temp.passwordStatus = "passwordNotNeeded";
            temp[key] = input.socialId; // set the social type's Id
            temp.accountType = input.accountType; // set the accountType
            if (input.socialName && (lodash.isEmpty(findResult || findResult.firstName === null))) {
                temp.firstName = input.socialName; // setting name of user if not already present in database
            }
            if (input.socialEmail && (lodash.isEmpty(findResult || findResult.email === null))) {
                temp.email = input.socialEmail; // setting email of user if not already present in database
            }
            if (input.socialProfilePic && (lodash.isEmpty(findResult || findResult.avatar === null))) {
                temp.avatar = input.socialProfilePic; // setting profile picture of user if not already present in database
            }
            temp.lastLoggedInTime = microtime.now(); // set last logged in time to current time

            // merge the fetched user data with the object created from inputs
            findResult = lodash.merge(findResult, temp); 
            data = lodash.merge(data, findResult); // merge the defaults with the above merged object
            resolve(data);
        }
    });
};


/**
 * Save (insert if new user or update for existing user) user details to database
 * @method saveUserDetails
 * @param {Object} User Used to get the mongoose connection object
 * @param {Object} userDetails Contains the merged object to save
 * @param {Object} flag Boolean value whether to create new document(flag = false) or update existing document(flag = true)
 * @returns {Promise} Promise containing the updated user details if successful, else containing the appropriate error message
 */
module.exports.saveUserDetails = function(User, userDetails, flag) {

    return new Promise(function(resolve, reject) {
        var find = {};
        if (userDetails.userId) { // if userDetails contains the objectId, copy it into find query and delete it from userDetails
            find._id = userDetails.userId;
            delete userDetails.userId;
        }
        // TODO: Replace save and findOneAndUpdate with upsert
        if (flag === false) { // creating new user if flag is false
            var saveUser = new User(userDetails);
            // save new user document
            saveUser.save(function(err, saveResponse) {
                if (err) {
                    reject({ id: 400, msg: err });
                } else {
                    saveResponse = JSON.parse(JSON.stringify(saveResponse));
                    delete saveResponse.password; // delete the user's hashed password before returning the user details
                    resolve([saveResponse, flag]);
                }
            });
        } else if (flag) { // updating existing user if flag is true
            // update existing user
            User.findOneAndUpdate(find, { $set: userDetails }, { new: true }, function(err, updateResponse) {
                if (err) {
                    reject({ id: 400, msg: err });
                } else {
                    updateResponse = JSON.parse(JSON.stringify(updateResponse));
                    delete updateResponse.password; // delete the user's hashed password before returning the user details
                    resolve([updateResponse, flag]);
                }
            });
        }
    });
};

/**
 * Call forgot password to create reset token and send confirmation mail to user
 * @method callForgotPassword
 * @param {Object} userDetails The details of the user
 * @param {Object} header Forwarding the header to get origin
 * @param {Seneca} seneca Seneca instance to be passed to forgotPassword
 * @returns {*}
 */
module.exports.callForgotPassword = function callForgotPassword(userDetails, header, seneca) {
    return new Promise(function(resolve) {
        // create JWT token to send in header
        var token = authentication.createMsJwt({isMicroservice: true});
        console.log("In callForgotPassword ------ ", userDetails.email);
        
        // input to forgotPassword
        var body = {
            email: userDetails.email,
            fromSignUp: true
        };
        lodash.assign(header, token);   // add the token to the headers
        
        // require forgotPassword and call it
        var forgotPassword = require(__base + 'actions/forgotPassword.js')({seneca: seneca});
        forgotPassword({ body: body, header: header }, function(err, result) {
            resolve(result);
        })
    });
};