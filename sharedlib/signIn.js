'use strict';

var Locale = require('./formatter');
var outputFormatter = new Locale(__dirname + '/../');
var utils = require('./utils');
var lodash = require('lodash');
var Promise = require('bluebird');
var bcrypt = require('bcrypt');
var microtime = require('microtime');

/**
 * Call sign up API of User microservice to signUp new social user
 * @function callsignUp
 * @param {Object} input - contains the input information returned by logging in on social site
 * @param {Object} header - contains the JWT Token
 * @param {Seneca} seneca - seneca instance to call other microservice
 * @returns {Promise}
 *
 */
var callSignUp = function callSignUp(input, header, seneca) {
    return new Promise(function(resolve, reject) {

        // console.log("Sign up called ---- ");
        /************* Create the input for the sign up request from the present input fields ***************/

        var body = { "signUpType": input.type };
        body.socialId = input.socialId;
        if (input.socialName) {
            body.socialName = input.socialName;
        }
        if (input.socialProfilePic) {
            body.socialProfilePic = input.socialProfilePic;
        }
        if (input.socialEmail) {
            body.socialEmail = input.socialEmail;
        }
        console.log("Before call ---- ");

        /************ Call SignUp microservice **************/
        utils.microServiceCall(seneca, 'authentication', 'signUp', body, header, function(err, result) {
            // if registration fails, ask user to register manually
            if (err || result.content.success === false) {
                console.log("Error in registering user --- ", err, result.content);
                reject({
                    id: 400,
                    msg: "You haven't registered with us, please register."
                });
            } else {
                resolve(result);
            }
        });
    });
};

module.exports.callSignUp = callSignUp;

/**
 * In case of email sign in, the function verifies the input password for the email provided
 * and returns the user details.
 * For social login(facebook or google), simply return the user details
 * for the socialId provided.
 * If email does not match, return "User not found." message.
 * If input password does not match then return "Password doesn't match".
 * If socialId doesn't match then user is signed up using socialId.
 * @function loginUser
 * @param {Object} input - The input parameters
 * @param {Object} User - Used to get the database model for User
 * @param {Object} Email - Used to get the database model for Email
 * @param {Object} header - contains the JWT Token and the request tokens
 * @param {Seneca} seneca - the seneca instance used to call other microservice
 * @returns {Promise} Returns Promise. In case of successful login it returns user details in Promise,
 * else it returns appropriate error message.
 *
 */
module.exports.findUser = function(User, Email, input, header, seneca) {
    var query = {};
    return new Promise(function(resolve, reject) {

        /************* Create find query based on type of login  ************/
        if (input.type === 'email') {
            query = {
                include: [{
                    model: Email,
                    as: 'emails',
                    where: { email: input.email }
                }]
            };
        } else {
            // create DB field by adding "Id" to the social type,
            // ie. facebook->facebookId, google->googleId, ...
            var field = input.type + "Id";
            query.where = {};
            query.where[field] = input.socialId;
        }

        console.log("Find query --- ", query);

        /************* Fetch user with matching email or socialID **************/
        User.findOne(query)   
            .then(function(result) {
                // console.log("Result of find ---- ", result);
                if (lodash.isEmpty(result)) {
                    /***************** If sign in type is social and socialId not found, register user *****************/
                    if (input.type !== 'email') {
                        // call sign up to register user if sign in type is social and user not registered
                        callSignUp(input, header, seneca)
                            .then(function(result) {
                                if (result.content.success) {
                                    resolve(result.content.data);
                                } else {
                                    reject({ id: 400, msg: result.content.message.description });
                                }
                            })
                            .catch(function(err) {
                                reject({ id: 400, msg: err });
                            });
                    } else {
                        // if sign in type was email and email is not found, return error message
                        reject(outputFormatter.format(false, 2270, null, 'email'));
                    }
                } else { // if (input.type !== 'email') {
                    /*var user = lodash.filter(result, function(user) {
                        if (input.orgId) {
                            return (user.userId == ownerId || lodash.indexOf(user.orgIds, input.orgId) != -1)
                        } else {
                            return (!lodash.isEmpty(user.ownedOrgIds));
                        }
                    });
                    user = user[0];*/
                    // console.log("User result after filtering ---- ", user);
                    // if sign in type was social and user is found,
                    // delete password and return user details
                    
                    // resolve user if found
                    resolve(result);
                }
            })
            .catch(function(err) {
                reject({ id: 400, msg: err });
            })
    });
};

module.exports.comparePasswords = function(input, user) {
    return new Promise(function(resolve, reject) {
        // console.log("Inside compare passwords ---- ");
        if (input.type == 'email') {
            // if sign in type was email and user is found
            // if user's password is not set, user had signed up using social login, ask him to reset his password.
            if (user.password === null) {
                reject(outputFormatter.format(false, 2280, null));
                // reject({id: 400, msg: "To sign in using email, reset your password."});
            } else {
                // if user is found and password is set, compare saved password input password
                bcrypt.compare(input.password, user.password, function(err, isMatch) {
                    if (err) {
                        reject(outputFormatter.format(false, 2290, null));
                    }
                    if (isMatch) {
                        // if passwords match, sign in successful, return user details
                        resolve(user);
                    } else {
                        reject(outputFormatter.format(false, 1020, null, "Password"));
                        // reject({id: 400, msg: "Password doesn't match."});
                    }
                });
            }
        } else {
            resolve(user);
        }
    });
}


/**
 * Update the last logged in time of the user to present timestamp after successful login
 * @function updateLoginTime
 * @param {Object} User Used to get the mongoose connection object
 * @param {Object} userDetails  Fetched details of the user, to get the _id of the logged in user
 * @returns {Promise} Returns Promise with latest user details
 *
 */
module.exports.updateLoginTime = function(User, userDetails) {
    return new Promise(function(resolve) {
        // Update lastLoggedInTime in user document and return updated document.
        User.update({ lastLoggedInTime: microtime.now() / 1000 }, { where: { userId: userDetails.userId }, returning: true, plain: true })
            .then(function (updatedUser) {
                // console.log("Updated response --- ", updatedUser);
                // if user details updated and returned,
                // remove password and return remaining details
                resolve(updatedUser[1].toJSON());
            })
            .catch(function(err) {
                console.log("Error updating user's login time ---- ", err);
                resolve(userDetails);
            });
    });
};