'use strict';

var maxFailAttempts = 5;
var currentAttempt = 1;

/**
 * requestHandlerFactory - Generic HAPI request handler factory, which bounces requests to remote microservices
 * @param  {Object} seneca - a seneca instance
 * @param  {String} apiName - the API endpoint name
 * @returns {Function}        return a requestHandlerFactory
 */
exports.requestHandlerFactoryBuilder = function(seneca, apiName) {
    return function requestHandlerFactory(method, action) {
        return function(request, reply) {
            seneca.log.info('API-GW: ' + apiName, method, action || '', 'request: ' + request.path);
            // Reply using a Seneca action (call to a remote microservice)
            seneca.act({
                role: apiName,  // the name of the microservice
                cmd: action || method,  // the action name to call
                path: request.params,   // the input received in path
                query: request.query,   // the input received in query
                header: request.headers,// the input headers
                body: request.payload,  // the input received in body
                credentials: request.auth.isAuthenticated ? request.auth.credentials : false,   // response of auth
                // middleware if authenticated successfully, else false
                endPoint: request.path, // the route or end point that was hit
                fatal$: false           // treat errors as non-fatal
            }, function(err, result) {
                if (err) {
                    seneca.log.error('API-GW: ' + apiName, err);
                    return reply(err);
                }
                // checking if microservice response contains headers and copying them to API reply headers
                if (result.headers) {
                    reply().hold();
                    for (var header in result.headers) {
                        reply().header(header, result.headers[header]);
                    }
                }
                // reply to API request
                return reply(result.content).code(result.statusCode || 200);
            });
        };
    };
};

/**
 * Swaggering - generate a swaggerize-hapi plugin for a new API registration (multi Swagger documents support)
 * @param  {String} apiName - the API endpoint name
 * @returns {Object}        return a new hapi plugin
 */
exports.Swaggering = function(apiName) {
    var Swaggerize = require('swaggerize-hapi');
    // Swagger wrapper plugin
    var swaggering = {
        register: function(server, options, next) {
            return Swaggerize.register(server, options, next);
        }
    };

    swaggering.register.attributes = {
        name: Swaggerize.register.attributes.name + '-' + apiName,
        version: Swaggerize.register.attributes.version
    };
    return swaggering;
};