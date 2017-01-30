'use strict';
// var Waterline = require('waterline');
// var waterline = new Waterline();
var seneca = require('seneca');
var sequelize = null;
seneca = new seneca();
// Lets define base dir for use in require file paths
global.__base = __dirname + '/';

// add comments later

function dbInit(done) {
    seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'Plugins Loaded ');
    seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'DB TYPE: ', process.env.DB_TYPE);
    seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'DB HOST: ', process.env.DB_HOST);
    seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'DB NAME: ', process.env.DB_NAME);

    if(process.env.DB_TYPE === 'mongodb') {
        var mongoose = require('mongoose');

        // connect to mongodb using host and port from environment
        mongoose.connect('mongodb://' + process.env.DB_HOST + '/' + process.env.DB_NAME);

        var connection = mongoose.connection;
        // enables the debug mode of mongoose depending on the value of debug from
        mongoose.set('debug', true);/*function (){
        if (process.env.DEBUG) {    // return true if debug mode is on
        return true;
        } else {
        return false;   // return false if debug mode is off
        }
        }*/

        // if mongodb connection gives error, show error message
        connection.on('error', function(error) {
            seneca.log.error('[ ' + process.env.SRV_NAME + ' ]', 'DB Connection: Failed - ', error);
        });

        // on connecting to mongodb, show success message
        connection.once('open', function() {
            seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'DB Connection: SUCCESS');
        });
    } else if(process.env.DB_TYPE === 'postgres') {
        var Sequelize = require('sequelize');
        sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
            host: process.env.DB_HOST || 'postgresdb',
            dialect: 'postgres',

            pool: {
                max: 5,
                min: 0,
                idle: 10000
            }
        });

        sequelize
            .authenticate()
            .then(function(err) {
                console.log('Connection has been established successfully.');
                done();
            })
            .catch(function (err) {
                console.log('Unable to connect to the database:', err);
            });
    }

    /*************************** Waterline ***************************/
    /*var sailsMongoAdapter = require('sails-mongo');
    var userCollection = Waterline.Collection.extend({
    identity: 'user',
    connection: 'default',
    attributes: {
    firstName: 'string',
    lastName: 'string'
    }
    });

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

    waterline.initialize(config, function (err, ontology) {
    if (err) {
    return console.error("Error initializing ------ ", err);
    } else {
    console.log("Connected to mongo db--------");

    waterline.loadCollection(userCollection);

    var User = ontology.collections.user;

    User.find().then(function (users) {
    console.log("Users ----- ", users);
    })
    }
    });*/
}

/* add comments later - to be used only by enpoint api microservice type */

/**
 * This is a seneca plugin for actions loading and resource definitions (e.g. databases)
 * The plugin loads actions automatically from the "actions" directory
 * @module plugin
 */

function workerPlugin() {
    var fs = require('fs');
    var path = require('path');

    // actions path
    var ACTS_PATH = path.join(__dirname, '/actions');
    // Shared models path
    var SHARED_MODELS_PATH = path.join(__dirname, '/sharedmodels/' + process.env.DB_TYPE);
    // models path
    var MODELS_PATH = path.join(__dirname, '/models/' + process.env.DB_TYPE);

    // Plugin init, for database connection setup
    seneca.add({
        init: process.env.SRV_NAME
    }, dbInit(function () {}));


    var options = {
        seneca: seneca,
        sequelize: sequelize
    };

    // TODO: search and load all files from multiple directories in single function
    // TODO: Make it recursive
    // Shared Models loading, form the models path
    if(fs.existsSync(SHARED_MODELS_PATH))
    {
        fs.readdirSync(SHARED_MODELS_PATH).forEach(function(file) {
          var f = path.basename(file, '.js');
          seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'Loading Shared Model: ', f);
          require(path.join(SHARED_MODELS_PATH, file))(options);
        });
    }

    // Models loading, form the models path
    if(fs.existsSync(MODELS_PATH)) {
        fs.readdirSync(MODELS_PATH).forEach(function (file) {
            var f = path.basename(file, '.js');
            seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'Loading Model: ', f);
            require(path.join(MODELS_PATH, file))(options);
        });
    }

    // Microservices actions
    if(fs.existsSync(ACTS_PATH)) {
        fs.readdirSync(ACTS_PATH).forEach(function (file) {
            var f = path.basename(file, '.js');
            seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'Loading Action: ', f);
            // add a seneca action, it will respond on every message tath will match role and cmd.
            // role is the microservice name, while cmd is the module file name which contains the action
            var action = ['role:', process.env.SRV_NAME, ',cmd:', f].join('');
            seneca.add(action, require(path.join(ACTS_PATH, file))(options));
        });
    }
    return process.env.SRV_NAME;
};


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

    // Initilize the DB connection
    // dbInit();

    // setting up seneca
    // TODO: Add ability to use choice of transport from list
    seneca.use('seneca-amqp-transport');
    seneca.client({
        type: 'amqp',
        pin: ['role:*,cmd:*'].join(','),
        host: process.env.QUEUE_HOST || '127.0.0.1'
    });

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
} else {
    // For all other worker microservices
    seneca.use('seneca-amqp-transport')
        .use(workerPlugin, {
            seneca: seneca
        })
        .listen({
            type: 'amqp',
            pin: ['role:', process.env.SRV_NAME, ',cmd:*'].join(''),
            host: process.env.QUEUE_HOST || '127.0.0.1'
        })
        .options({
            timeout: 99999999 // Adding time out(in milliseconds) of the request
        })
}