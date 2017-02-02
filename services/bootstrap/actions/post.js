'use strict';

/*
 * This is an action for the Bootstrap microservice
 * Used to enter sample data into database for testing purposes
 */

var utils = require(__base + '/sharedlib/utils');
var lodash = require('lodash');
var Promise = require('bluebird');
var fs = require('fs');
var Waterline = require('waterline');
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

function dbInit(ontology, waterline, seneca) {
    return new Promise(function(resolve, reject) {
        if (ontology) {
            resolve(ontology);
        } else {
            seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'Plugins Loaded ');
            seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'DB TYPE: ', process.env.DB_TYPE);
            seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'DB HOST: ', process.env.DB_HOST);
            seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'DB NAME: ', process.env.DB_NAME);

            loadModels(waterline, seneca);
            if (process.env.DB_TYPE === 'mongodb') {
                var sailsMongoAdapter = require('sails-mongo');

                var config = {
                    adapters: {
                        'mongo': sailsMongoAdapter
                    },

                    connections: {
                        default: {
                            adapter: 'mongo',
                            host: process.env.DB_HOST || 'localhost',
                            port: 27017,
                            database: process.env.DB_NAME
                        }
                    }
                };
            } else if (process.env.DB_TYPE === 'postgresdb') {
                var sailsPostgresAdapter = require('sails-postgresql');

                var config = {
                    adapters: {
                        'postgres': sailsPostgresAdapter
                    },

                    connections: {
                        default: {
                            adapter: 'postgres',
                            database: process.env.DB_NAME,
                            host: process.env.DB_HOST || 'localhost',
                            user: process.env.DB_USER,
                            password: process.env.DB_PASS,
                            port: 5432,
                            pool: true,
                            ssl: false
                        }
                    }
                };
            }
            waterline.initialize(config, function(err, ontology) {
                if (err) {
                    return console.error("Error initializing ------ ", err);
                    reject({ id: 400, msg: err });
                } else {
                    console.log("Connected to " + process.env.DB_TYPE + " --------");
                    resolve(ontology);
                }
            });
        }
    });
}

function loadModels(waterline, seneca) {

    var fs = require('fs');
    var path = require('path');

    // Shared models path
    var SHARED_MODELS_PATH = path.join(__base, '/sharedmodels/' + 'waterline');
    // models path
    var MODELS_PATH = path.join(__base, '/models/' + 'waterline');

    // TODO: search and load all files from multiple directories in single function
    // TODO: Make it recursive
    // Shared Models loading, form the models path
    if (fs.existsSync(SHARED_MODELS_PATH)) {
        fs.readdirSync(SHARED_MODELS_PATH).forEach(function(file) {
            var f = path.basename(file, '.js');
            seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'Loading Shared Model: ', f);
            var model = require(path.join(SHARED_MODELS_PATH, file));
            model.migrate = 'alter';
            waterline.loadCollection(Waterline.Collection.extend(model));
        });
    }

    // Models loading, form the models path
    if (fs.existsSync(MODELS_PATH)) {
        fs.readdirSync(MODELS_PATH).forEach(function(file) {
            var f = path.basename(file, '.js');
            seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'Loading Model: ', f);
            var model = require(path.join(MODELS_PATH, file));
            model.migrate = 'alter';
            waterline.loadCollection(Waterline.Collection.extend(model));
        });
    }

}

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

                    // if organizations array is not empty, iterate over the Ids and convert the organization ids to
                    // ObjectIds
                    /*if (!lodash.isEmpty(item.orgIds)) {
                        var convertedOrgIds = [];
                        item.orgIds.forEach(function(orgId) { // iterate the organization array
                            var Id = new mongodb.ObjectID(orgId);   // convert id to ObjectId
                            convertedOrgIds.push(Id);   // push into new array
                        });
                        item.orgIds = convertedOrgIds;
                    }*/
                    // if avatar of user is set, complete it by prefixing it with data URL
                    /*if (item.avatar) {
                      item.profilePic = response.createBootstrapFileURL(item.profilePic);// add the S3 Data
                      // URL to the image address if it has been uploaded.
                    }*/
                }

                /*if (items.collection === 'organizations') { // check if collection is user collection

                    // if organizations contains owner Id, convert the owner Id to ObjectId
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
 * @param {Object} ontology Database connection
 * @returns {Promise} Promise is always resolved after inserting all data into database
 */
var insertDocuments = function(ontology) {
    return new Promise(function(resolve, reject) {
        var length = data.length;
        var errors = [];
        data.forEach(function(items, i) { // iterate over the different collections
            var collection = (items.collection); // get the collection name
            ontology.collections[collection].destroy({})
                .then(function(data) {
                    return ontology.collections[collection].create(items.data);
                })
                .then(function() {
                    length--;
                    if (length === 0 && errors.length === 0) {
                        resolve();
                    } else if (length === 0 && errors.length > 0) {
                        reject(errors);
                    }
                })
                .catch(function(err) {
                    length--;
                    console.log("Error in insert ----- ", err);
                    errors.push(err.message);
                    if (length === 0) {
                        reject(errors);
                    }
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
    var ontology = null;
    return function(args, done) {

        // check if token is present in input headers
        if (args.header && args.header.bootstraptoken && token != null && args.header.bootstraptoken === token) {
            var waterline = new Waterline();
            dbInit(ontology, waterline, seneca)
                .then(function(response) {
                    ontology = response;
                    // read the bootstrap data from file                    
                    data = JSON.parse(fs.readFileSync(__dirname + '/../allDataWaterline.json'));
                    return convertObjectIds();
                })
                .then(function() {
                    return insertDocuments(ontology);
                })
                .then(function() {
                    token = null;
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
            token = utils.createMsJWT({ timestamp: microtime.now() }).authorization;
            done(null, {
                statusCode: 200,
                content: utils.fetchSuccess(200, "Use this token and request bootstrap again.", token, microtime.now())
            });
        }
    };
};