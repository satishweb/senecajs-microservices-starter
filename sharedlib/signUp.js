'use strict';

var Locale = require('./formatter');
var utils = require('./utils');
var outputFormatter = new Locale(__dirname + '/../');
var lodash = require('lodash');
var Promise = require('bluebird');
var bcrypt = require('bcrypt');
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
        var find = { orgId: null }; // object for search query parameters
        var temp = []; // array for or queries in find
        switch (input.signUpType) {
            case 'email': // checking if signUpType is email then setting email as find query parameter
                find.email = input.email;
                break;
            case 'google':
            case 'linkedIn':
            case 'facebook':
                var socialId = {};
                socialId[input.signUpType + 'Id'] = input.socialId;
                temp.push(socialId);
                input.socialEmail ? temp.push({ 'email': input.socialEmail }) : null;
                find.or = temp;
                break;
        }
        // fetch user if present in database
        if (lodash.isEmpty(find)) {
            reject(outputFormatter.format(false, 1020, 'input'));
        } else {
            User.findOne(find)
                .then(function(findResult) {
                    // if no user is found, can continue with sign up
                    if (lodash.isEmpty(findResult)) {
                        resolve([{}, flag]);
                    } else {
                        // if user is found, checking if the social email matches the email in database.
                        // if yes, will update the user's profile by adding the social info to it and linking with his social account
                        if (input.socialEmail && findResult.email === input.socialEmail) { // checking if
                            // emailId from social account is same as found in find result
                            flag = true; // setting flag to true to merge account later
                            resolve([findResult, flag]);
                        } else {
                            done(null, {
                                statusCode: 200,
                                content: outputFormatter.format(false, 2300, null, findResult.email || 'User')
                            });
                        }
                    }
                })
                .catch(function(err) {
                    reject({ id: 400, msg: err });
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
            password: null,
            googleId: null,
            linkedInId: null,
            facebookId: null,
            lastLoggedInTime: null,
            passwordStatus: "passwordNotSet"
        };
        if (input.signUpType === 'email') { // if type is email, set email related fields
            temp = {
                email: input.email,
                firstName: input.name,
                lastLoggedInTime: microtime.now()
            };
            data = lodash.merge(data, temp); // merge the defaults with the object created from inputs
            resolve(data);
        } else if (input.signUpType === 'google' || input.signUpType === 'linkedIn' || input.signUpType === 'facebook') { // if type is social sign up

            var key = input.signUpType + 'Id';
            temp.passwordStatus = "passwordNotNeeded";
            temp[key] = input.socialId; // set the social type's Id
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
            find.userId = userDetails.userId;
            delete userDetails.userId;
        }
        if (flag === false) { // creating new user if flag is false
            // save new user document
            User.create(userDetails)
                .then(function(saveResponse) {
                    resolve([saveResponse, flag]);
                })
                .catch(function(err) {
                    console.log("Error in save user details create ----- ", err);
                    reject({ id: 400, msg: err });
                });
        } else if (flag) { // updating existing user if flag is true
            // update existing user
            User.update(find, userDetails)
                .then(function(updateResponse) {
                    delete updateResponse.password; // delete the user's hashed password before returning the user details
                    resolve([updateResponse[0], flag]);
                })
                .catch(function(err) {
                    console.log("Error in save user details update ----- ", err);
                    reject({ id: 400, msg: err });
                });
        }
    });
};

/**
 * Call forgot password to create reset token and send confirmation mail to user
 * @method callForgotPassword
 * @param {Object} userDetails The details of the user
 * @param {Object} header Forwarding the header to get origin
 * @param {Object} options Seneca and Waterline instance to be passed to forgotPassword
 * @returns {*}
 */
module.exports.callForgotPassword = function callForgotPassword(userDetails, header, options) {
    return new Promise(function(resolve) {
        // create JWT token to send in header
        var token = utils.createMsJWT({ isMicroservice: true });

        // input to forgotPassword
        var body = {
            email: userDetails.email,
            fromSignUp: true
        };
        lodash.assign(header, token); // add the token to the headers

        // require forgotPassword and call it
        var forgotPassword = require(__base + 'actions/forgotPassword.js')(options);
        forgotPassword({ body: body, header: header }, function(err, result) {
            resolve(result);
        })
    });
};