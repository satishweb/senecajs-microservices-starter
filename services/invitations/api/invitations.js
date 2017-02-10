'use strict';

var path = require('path');
var $RefParser = require('json-schema-ref-parser');
var tools = require(__base + 'sharedlib/apiTools');

var API_NAME = path.basename(__filename, '.js');
var SWAGGER_FILE = __dirname + '/' + API_NAME + '.yaml';

module.exports = function(server, options, done) {

    var seneca = options.seneca;
    var parser = new $RefParser();
    var requestHandlerFactory = tools.requestHandlerFactoryBuilder(seneca, API_NAME);
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
                                'inviteUsers': {
                                    $post: requestHandlerFactory('post', 'inviteUsers')
                                },
                                'validateInvitation': {
                                    $post: requestHandlerFactory('post', 'validateInvitation')
                                }
                            }
                        }
                    }
                },
                function(err) {
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