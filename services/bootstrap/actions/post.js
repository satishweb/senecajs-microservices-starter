'use strict';

/*
 * This is an action for the Bootstrap microservice
 * Used to enter sample data into database for testing purposes
 */

var utils = require(__base + '/sharedlib/utils');
var lodash = require('lodash');
var Promise = require('bluebird');
var fs = require('fs');
var mongodb = require('mongodb');
var bcrypt = require('bcrypt');
var microtime = require('microtime');
var mongoose = require('mongoose');
var SALT_WORK_FACTOR = 10;
var data = null;

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

                // if document contains an _id field, convert it to ObjectId
                if (item._id) {
                    var Id = new mongodb.ObjectID(item._id);
                    item._id = Id;
                }

                // set the createdAt and updatedAt timestamps to present time
                item.createdAt = d;
                item.updatedAt = d;

                if (items.collection === 'users') { // check if collection is user collection
                    // if user password is set, hash it
                    if (item.password) {
                        var hash = bcrypt.hashSync(item.password, SALT_WORK_FACTOR); // hash the user's password and set the
                        // hash as password
                        item.password = hash;
                    }

                    // if organizations array is not empty, iterate over the Ids and convert the organization ids to
                    // ObjectIds
                    if (!lodash.isEmpty(item.orgIds)) { 
                        var convertedOrgIds = [];
                        item.orgIds.forEach(function(orgId) { // iterate the organization array
                            var Id = new mongodb.ObjectID(orgId);   // convert id to ObjectId
                            convertedOrgIds.push(Id);   // push into new array
                        });
                        item.orgIds = convertedOrgIds;
                    }
                    // if avatar of user is set, complete it by prefixing it with data URL
                    /*if (item.avatar) {
                      item.profilePic = response.createBootstrapFileURL(item.profilePic);// add the S3 Data
                      // URL to the image address if it has been uploaded.
                    }*/
                }

                if (items.collection === 'organizations') { // check if collection is user collection

                    // if organizations contains owner Id, convert the owner Id to ObjectId
                    if (item.ownerId) {
                        item.ownerId = new mongodb.ObjectID(item.ownerId);   // convert owner id to ObjectId
                    }
                }
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
        db.dropDatabase();  // clear the database
        resolve(true);
    });
};

/**
 * Inserting bootstrap data for different collections into database from array of objects
 * @method insertDocuments
 * @param {Object} db Database connection
 * @returns {Promise} Promise is always resolved after inserting all data into database
 */
var insertDocuments = function(db) {
    return new Promise(function(resolve) {
        data.forEach(function(items, i) {   // iterate over the different collections
            var collection = (items.collection);    // get the collection name
            db.collection(collection, function(err, coll) {
                coll.remove({}, function() { // delete the present data from the database before inserting the dummy data
                    coll.insertMany(items.data, function() { // insert the bootstrap data into the collection
                        if (i === data.length - 1) {    // if all collections have been added, resolve
                            resolve();
                        }
                    });
                });
            });
        });
    });
};

/**
 * This is a post action for the Bootstrap microservice
 * Used to clear the database and then insert documents
 */

module.exports = function(options) {
    var seneca = options.seneca;
    return function(args, done) {
        // read the bootstrap data from file
        data = JSON.parse(fs.readFileSync(__dirname + '/../allData.json'));
        var db = mongoose.connections[0].db;    // 
        if (process.env.DB_TYPE === 'mongodb') {
            convertObjectIds()
                .then(function() {
                    return clearDatabase(db);
                })
                .then(function() {
                    return insertDocuments(db);
                })
                .then(function() {
                    done(null, {
                        statusCode: 200,
                        content: utils.success(200, "Bootstrap data inserted successfully.", microtime.now())
                    });
                })
                .catch(function(err) {
                    seneca.log.error('[ ' + process.env.SRV_NAME + ': ' + __filename.split('/').slice(-1) + ' ]', "ERROR" +
                        " : ", err);
                    done(null, {
                        statusCode: 200,
                        content: utils.error(400, err || "Unexpected error", microtime.now())
                    });
                });
        } else if (process.env.DB_TYPE === 'postgres'){
            var sequelize = options.sequelize;
            var User = sequelize.import(__base + 'sharedmodels/postgres/users.js');
            User.sync();
            done(null, {
                statusCode: 200,
                content: utils.success(200, "Bootstrap data inserted successfully.", microtime.now())
            });
        }
    };
};