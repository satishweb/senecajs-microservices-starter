'use strict';

/*
 * This is an action for the Bootstrap microservice
 * Used to enter sample data into database for testing purposes
 */

var utils = require(__base + 'sharedlib/utils');
var lodash = require('lodash');
var Promise = require('bluebird');
var fs = require('fs');
var bcrypt = require('bcrypt');
var microtime = require('microtime');
var SALT_WORK_FACTOR = 10;
var data = null;
var token = null;

/**
 * @module post
 */

/**
 * This function does the following:
 * Convert the objectIds in the documents from string to objectId
 * Hashes the password field in user document
 * @method convertObjectIds
 * @returns {Promise} Returns Promise with decoded information from token when token is valid.
 */

var convertObjectIds = function() {
    return new Promise(function(resolve) {
        var d = new Date(); // timestamp to set the updatedAt and createdAt fields

        data.forEach(function(items) { // items gives the collection object, consisting of collection name and
            // collection data
            items.data.forEach(function(item) { // item gives a single document from the collection

                if (items.collection === 'users') { // check if collection is user collection
                    // if user password is set, hash it
                    if (item.password) {
                        var hash = bcrypt.hashSync(item.password, SALT_WORK_FACTOR); // hash the user's password and set the
                        // hash as password
                        item.password = hash;
                    }

                    // if teams array is not empty, iterate over the Ids and convert the team ids to
                    // ObjectIds
                    /*if (!lodash.isEmpty(item.teamIds)) {
                        var convertedTeamIds = [];
                        item.teamIds.forEach(function(teamId) { // iterate the team array
                            var Id = new mongodb.ObjectID(teamId);   // convert id to ObjectId
                            convertedTeamIds.push(Id);   // push into new array
                        });
                        item.teamIds = convertedTeamIds;
                    }*/
                    // if avatar of user is set, complete it by prefixing it with data URL
                    /*if (item.avatar) {
                      item.profilePic = response.createBootstrapFileURL(item.profilePic);// add the S3 Data
                      // URL to the image address if it has been uploaded.
                    }*/
                }

                /*if (items.collection === 'teams') { // check if collection is user collection

                    // if teams contains owner Id, convert the owner Id to ObjectId
                    if (item.ownerId) {
                        item.ownerId = new mongodb.ObjectID(item.ownerId);   // convert owner id to ObjectId
                    }
                }*/
            });
        });
        resolve(true);
    });
};

/**
 * Clear the database by dropping all collections
 * @method clearDatabase
 * @param {Object} db Database connection
 * @returns {Promise} Promise resolved with true
 */
var clearDatabase = function(db) {
    return new Promise(function(resolve) {
        db.dropDatabase(); // clear the database
        resolve(true);
    });
};

/**
 * Inserting bootstrap data for different collections into database from array of objects
 * @method insertDocuments
 * @param {Object} dbConnection Database connection
 * @returns {Promise} Promise is always resolved after inserting all data into database
 */
var insertDocuments = function(dbConnection) {
    return new Promise(function(resolve, reject) {
        var length = data.length;
        var errors = [];
        dbConnection.sync({ force: true })
            .then(function() {
                return convertObjectIds();
            })
            .then(function() {
                /*data.forEach(function (items, i) { // iterate over the different collections
                    var collection = items.collection;
                    console.log("Model ---- ", dbConnection.models[collection]);
                    if (dbConnection.models[collection]) {
                        dbConnection.models[collection].bulkCreate(items.data)
                            .then(function () {
                                length--;
                                if (length === 0 && errors.length === 0) {
                                    resolve();
                                } else if (length === 0 && errors.length > 0) {
                                    reject(errors);
                                }
                            })
                            .catch(function (err) {
                                length--;
                                console.log("Error in insert ----- ", err);
                                errors.push(err.message);
                                if (length === 0) {
                                    reject(errors);
                                }
                            });
                    }
                });*/
                Promise.each(data, function(items) {
                        var collection = items.collection;
                        console.log("Model ---- ", dbConnection.models[collection]);
                        if (dbConnection.models[collection]) {
                            return Promise.each(items.data, function (row) {
                                return dbConnection.models[collection].create(row);
                            });
                        }
                    })
                    // .then(function() {

                        // joins on users using ownerId
                        /*return dbConnection.models['teams'].findAll({
                            include: [{
                                model: dbConnection.models.users,
                                through: {
                                    attributes: ['userId'],
                                    where: { userId: 1 }
                                }
                            }]
                        })*/

                        // joins on users using join_userorgs                        
                        /*return dbConnection.models['teams'].findAll({
                            include: [{
                                model: dbConnection.models.users
                            }]
                        })*/

                    //     return dbConnection.models['teams'].findAll()
                    // })
                    .then(function (orgs) {
                        // orgs.forEach(function(org) {
                        //     console.log("orgs ---- ", org.toJSON());
                        // });
                        resolve();
                    })
                    .catch(function(err) {
                        reject(err);
                    })
            })
    });
};

/**
 * This is a post action for the Bootstrap microservice
 * Used to clear the database and then insert documents
 */

module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function(args, done) {

        // check if token is present in input headers
        if (args.header && args.header.bootstraptoken && token != null && args.header.bootstraptoken === token) {
            data = JSON.parse(fs.readFileSync(__base + 'allData.json'));
            insertDocuments(dbConnection)
                .then(function () {
                    token = null;
                    // altering the sequences to start after the bootstrap data
                    Promise.all([dbConnection.query('ALTER SEQUENCE "sessions_sessionId_seq" RESTART WITH 2'),
                    dbConnection.query('ALTER SEQUENCE "groups_groupId_seq" RESTART WITH 7'),
                    dbConnection.query('ALTER SEQUENCE "teams_teamId_seq" RESTART WITH 4'),
                    dbConnection.query('ALTER SEQUENCE "users_userId_seq" RESTART WITH 9'),
                    dbConnection.query('ALTER SEQUENCE "roles_roleId_seq" RESTART WITH 4')]);
                })
                .then(function () {
                    done(null, {
                        statusCode: 200,
                        content: utils.success(200, "Bootstrap data inserted successfully.", microtime.now())
                    });
                })
                .catch(function(err) {
                    console.log("Error in bootstrap ---- ", err);
                    token = null;
                    done(null, {
                        statusCode: 200,
                        content: utils.fetchSuccess(400, "Bootstrap data unsuccessful.", err.message || err, microtime.now())
                    });
                });
        } else {
            // console.log("dbConnection ---- ", dbConnection);
            token = utils.createMsJWT({ timestamp: microtime.now() }).authorization;
            done(null, {
                statusCode: 200,
                content: utils.fetchSuccess(200, "Use below provided token in key 'data' as 'BootstrapToken' in headers and send setup request again.", token, microtime.now())
            });
        }
    };
};