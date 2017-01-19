'use strict';

var path = require('path');
var $RefParser = require('json-schema-ref-parser');
var tools = require(__base + '/sharedlib/apiTools');
var Promise = require('bluebird');
var microtime = require('microtime');
var awsS3Upload = require(__base + '/sharedlib/awsS3Upload.js');

var API_NAME = path.basename(__filename, '.js');
var SWAGGER_FILE = __dirname + '/' + API_NAME + '.yaml';

module.exports = function(server, options, done) {
    var seneca = options.seneca;
    var parser = new $RefParser();
    var swaggering = tools.Swaggering(API_NAME);

    seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', '[ ' + API_NAME + ' ]', 'API INIT SUCCESS');

    parser.dereference(SWAGGER_FILE)
        .then(function(schema) {
            server.register({
                register: swaggering,
                options: {
                    api: schema,
                    docspath: '/apidocs/' + API_NAME,

                    // endpoints handlers hashmap. it shall match the Swagger endpoints
                    handlers: {
                        'v1': {
                            'upload': {
                                $post: function(request, reply) {
                                    var file = [];
                                    // check if input contains the files to be uploaded in the file variable
                                    if (!request.payload || !request.payload.file) {
                                        // if not present, return error message
                                        reply({
                                            success: false,
                                            message: {
                                                id: 400,
                                                description: "\"file\" field is required."
                                            },
                                            timestamp: microtime.now(),
                                            version: "1.0"
                                        }).code(200);
                                    } else {
                                        // check if input file is an array
                                        if (request.payload.file.constructor !== Array) {
                                            // if file is not an array, make it an array
                                            file.push(request.payload.file);
                                            request.payload.file = file;
                                        }

                                        // check if objectType is provided in input
                                        if (!request.payload.objectType) {
                                            //otherwise set it to default
                                            request.payload.objectType = 'default';
                                        }
                                        // check if objectPath is provided in input
                                        if (!request.payload.objectPath) {
                                            //otherwise set it to default
                                            request.payload.objectPath = 'general';
                                        }
                                        awsS3Upload.s3UploadFile(process.env.S3_DATA_BUCKET, request.payload.objectType,
                                                request.payload.objectPath, request.payload.file)
                                            .then(function(url) {
                                                reply({
                                                    success: true,
                                                    message: { id: 200, description: "Files uploaded" },
                                                    data: url,
                                                    timestamp: microtime.now(),
                                                    version: "1.0"
                                                }).code(200);
                                            })
                                            .catch(function(err) {
                                                reply({
                                                    success: false,
                                                    message: { id: 400, description: err },
                                                    timestamp: microtime.now(),
                                                    version: "1.0"
                                                }).code(200);
                                            });
                                    }
                                }
                            }
                        }
                    }
                }
            }, function(err) {
                if (err) {
                    seneca.log.error('[ ' + process.env.SRV_NAME + ' ]', '[ ' + API_NAME + ' ]', 'Swaggering: ', err);
                } else {
                    seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', '[ ' + API_NAME + ' ]', 'Swaggering: Loaded');
                }
            });
            done();
        }).catch(function(err) {
            done(err);
        });
};