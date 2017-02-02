'use strict';
var Waterline = require('waterline');
var waterline = new Waterline();
var seneca = require('seneca');
seneca = new seneca();
// Lets define base dir for use in require file paths
global.__base = __dirname + '/';

// add comments later

function dbInit(options) {
    seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'Plugins Loaded ');
    seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'DB TYPE: ', process.env.DB_TYPE);
    seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'DB HOST: ', process.env.DB_HOST);
    seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'DB NAME: ', process.env.DB_NAME);

    loadModels(waterline);
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
        } else {
            console.log("Connected to " + process.env.DB_TYPE + " --------");
            options.wInstance = ontology;
            if (process.env.SRV_NAME === 'api') {
                loadApi(options);
            } else {
                loadActions(options);
            }
        }
    });
}

/* add comments later - to be used only by enpoint api microservice type */

/**
 * This is a seneca plugin for actions loading and resource definitions (e.g. databases)
 * The plugin loads actions automatically from the "actions" directory
 * @module plugin
 */

function workerPlugin() {

    if (process.env.SRV_NAME === 'bootstrap') {
        // Plugin init, for database connection setup
        seneca.add({
            init: process.env.SRV_NAME
        }, loadActions({ seneca: seneca }));
    } else {
        // Plugin init, for database connection setup
        seneca.add({
            init: process.env.SRV_NAME
        }, dbInit({ seneca: seneca }));
    }


    return process.env.SRV_NAME;
};

function loadModels(waterline) {

    var fs = require('fs');
    var path = require('path');

    // Shared models path
    var SHARED_MODELS_PATH = path.join(__dirname, '/sharedmodels/' + 'waterline');
    // models path
    var MODELS_PATH = path.join(__dirname, '/models/' + 'waterline');

    // TODO: search and load all files from multiple directories in single function
    // TODO: Make it recursive
    // Shared Models loading, form the models path
    if (fs.existsSync(SHARED_MODELS_PATH)) {
        fs.readdirSync(SHARED_MODELS_PATH).forEach(function(file) {
            var f = path.basename(file, '.js');
            seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'Loading Shared Model: ', f);
            waterline.loadCollection(Waterline.Collection.extend(require(path.join(SHARED_MODELS_PATH, file))));
        });
    }

    // Models loading, form the models path
    if (fs.existsSync(MODELS_PATH)) {
        fs.readdirSync(MODELS_PATH).forEach(function(file) {
            var f = path.basename(file, '.js');
            seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'Loading Model: ', f);
            waterline.loadCollection(Waterline.Collection.extend(require(path.join(MODELS_PATH, file))));
        });
    }

}

function loadActions(options) {
    var fs = require('fs');
    var path = require('path');

    // actions path
    var ACTS_PATH = path.join(__dirname, '/actions');

    // Microservices actions
    if (fs.existsSync(ACTS_PATH)) {
        fs.readdirSync(ACTS_PATH).forEach(function(file) {
            var f = path.basename(file, '.js');
            seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'Loading Action: ', f);
            // add a seneca action, it will respond on every message tath will match role and cmd.
            // role is the microservice name, while cmd is the module file name which contains the action
            var action = ['role:', process.env.SRV_NAME, ',cmd:', f].join('');
            seneca.add(action, require(path.join(ACTS_PATH, file))(options));
        });
    }
}

;

function loadApi(options) {
    // authentication/authorization modules
    // register the auth strategies
    require('./auth/index.js')(options);

    // API groups
    // register the API routes
    require('./api/index.js')(options, function(err) {

        if (err) {
            seneca.log.error('[ ' + process.env.SRV_NAME + ' ]', 'Could not load APIs', err);
            throw err;
            return;
        }

        // Start the Server
        seneca.ready(function() {
            server.start(function(exc) {
                if (exc) {
                    seneca.log.error('[ ' + process.env.SRV_NAME + ' ]', 'Server Start ERROR:', exc);
                    throw exc;
                    return;
                }
                seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'Server Listen:', server.info.uri);
            });
        });
    });
}

// Main function for microservice
if (process.env.SRV_NAME === 'api') {

    var Hapi = require('hapi');
    var server = new Hapi.Server();
    var options = {
        server: server,
        seneca: seneca
    };

    // specify host and port for server connection
    server.connection({
        host: '0.0.0.0',
        port: 3000,
        routes: {
            cors: {
                origin: ['*'],
                //TODO: Allow only listed hosts to access.
                additionalHeaders: ['Access-Control-Request-Headers', 'Accept', 'Access-Control-Request-Method']
            },
            payload: {
                maxBytes: (8 * 1048576) // In Bytes
            }
        }
    });

    // setting up seneca
    // TODO: Add ability to use choice of transport from list
    seneca.use('seneca-amqp-transport');
    seneca.client({
        type: 'amqp',
        pin: ['role:*,cmd:*'].join(','),
        host: process.env.QUEUE_HOST || '127.0.0.1'
    });

    // Initilize the DB connection
    dbInit(options);
} else {
    // For all other worker microservices
    seneca.use('seneca-amqp-transport')
        .use(workerPlugin)
        .listen({
            type: 'amqp',
            pin: ['role:', process.env.SRV_NAME, ',cmd:*'].join(''),
            host: process.env.QUEUE_HOST || '127.0.0.1'
        })
        .options({
            timeout: 99999999 // Adding time out(in milliseconds) of the request
        })
}