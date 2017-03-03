'use strict';

var utils = require(__base + '/sharedlib/utils');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__base);
var InitCompositeGrid = require(__base + '/sharedlib/grid/initCompositeGrid');
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var Team = null;

/**
 * @module getTeam
 */


/**
 * Fetch Team details by fqdn or team Id
 * @method fetchTeam
 * @param {Object} args Used to get input parameters
 * @returns {Promise} Promise containing matching Team document if successful, else containing
 * the error message
 */
function fetchTeam(args) {
    return new Promise(function(resolve, reject) {
        var find = null;

        // if input has fqdn in input, create find query using fqdn in query
        if (args.fqdn) {
            find = { where: {fqdn: args.fqdn, isDeleted: false}}
        }
        // if input has team Id in input, create find query using team Id
        if (args.teamId) {
            find = { where: {teamId: args.teamId, isDeleted: false}}
        }

        // Find the team using find query created
        Team.findOne(find)
            .then(function(findResponse) {
                // if error or team is not found, reject with error message
                if (lodash.isEmpty(findResponse)) {
                    reject({ id: 400, msg: 'Invalid team.' });
                } else { // else return team document fetched
                    resolve(findResponse.toJSON());
                }
            })
            .catch(function(err) {
                console.log("Error in fetchTeam ---- ", err);
                reject({ id: 400, msg: err || 'Invalid team.' });
            })
    });
}

/**
 * Fetch list of teams using grid library for searching, filtering, sorting and pagination
 * @method getTeamList
 * @param {Seneca} seneca The seneca instance used for microservice calls in grid library
 * @param {Object} input The input
 * @returns {Promise} Promise containing the formatted result if resolved successfully or the error if rejected.
 */

function getTeamList(seneca, input, dbConnection) {
    var config;
    // create the configuration object for grid
    var collection = {
        "teamId": {
            "displayName": "Team Id",
            "filter": true
        },
        "domain": {
            "displayName": "Domain"
        },
        "website": {
            "displayName": "Website",
            "search": true
        },
        "ownerId": {
            "databaseName": "$owner.userId$",
            "displayName": "Owner Id",
            "filter": true,
            "sort": true, 
            "join": {
                model: "users",
                as: "owner",
                fields: ['userId', 'firstName', 'lastName']
            }
        },
        "userId": {
            "databaseName": "$users.userId$",
            "displayName": "Users",
            "filter": true,
            "join": {
                model: "users",
                fields: ['userId', 'firstName', 'lastName'],
                exclude: ['join_userteams']
            }
        },
        "groupId": {
            "databaseName": "$groups.groupId$",
            "displayName": "Groups",
            "filter": true,
            "join": {
                model: "groups",
                fields: ['groupId', 'name'],
            }
        },
        "name": {
            "displayName": "Team Name",
            "search": true,
            "sort": true
        },
        "description": {
            "displayName": "Description"
        },
        "subDomain": {
            "displayName": "Sub Domain"
        },
        'isDeleted': {
            "filter": true,
            "displayName": "Deleted",
            "show": false
        }
    };
    config = { 'listTeam': { 'collections': {} } };
    config.listTeam.collections['teams'] = collection;

    // add filter to always return only non deleted teams
    // if filter is present in input, add it to filter
    if (input.filter) {
        input.filter.isDeleted = false;
    } else { // if filter object is not present in input, create filter and set is deleted
        input.filter = {
            isDeleted: false
        }
    }

    // create instance of composite grid from config object created
    var compositeGrid = InitCompositeGrid.initFromConfigObject(input, 'listTeam', dbConnection, seneca, config);

    // fetch the result using instance
    return compositeGrid.fetch();
}

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {String} result The final result to be returned, contains the token created
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    // list output is already formatted and contains configurations object
    // if success is present in result, no need to format output and remove configuration object
    if ('success' in result) {
        // used to remove configuration object from list output
        // if configuration is present in output, delete it
        if (result && result.data && result.data.configuration) {
            delete result.data.configuration;
        }
        done(null, { statusCode: result.success ? 200 : 400, content: result })
    } else if (!lodash.isEmpty(result)) { // else format the output
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2040, result, 'Team')
        });
    } else { //else return error
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
}

/**
 * Creates a Joi validation schema depending on the input action. If an incorrect action is provided, error is returned.
 * @method createSchema
 * @param {Object} input The input
 * @returns {Promise} The Promise containing the Joi validation schema created according to the input action or the
 * error message if incorrect or no action provided.
 */

function createSchema(input) {
    var joiSchema;
    return new Promise(function(resolve, reject) {
        switch (input.action) {
            // if action is either 'id' or 'fqdn', create same schema
            case 'id':
            case 'fqdn':
                //Joi validation Schema for action fqdn or teamId
                //TODO: MOVE
                joiSchema = Joi.object().keys({
                    fqdn: Joi.string(),
                    teamId: Joi.number()
                }).without('fqdn', 'teamId').without('teamId', 'fqdn'); // input should have either fqdn or teamId
                resolve(joiSchema);
                break;
            case 'list':
                //Joi validation Schema for list
                joiSchema = Joi.object().keys({
                    filter: Joi.object(),
                    searchKeyword: Joi.object(),
                    sort: Joi.object(),
                    limit: Joi.number(),
                    page: Joi.number()
                });
                resolve(joiSchema);
                break;
            default:
                // if action doesn't match any of the above, return error
                reject({ id: 400, msg: "Enter a valid action." });
        }
    });
}

/**
 * This is a POST action for the Teams microservice
 * It fetches a single team if input action is 'id' or 'fqdn', or a list of teams if input action is
 * 'list'. If action doesn't match the above actions or no action provided, it returns an error message.
 * @param {Object} options Contains the seneca instance
 */

module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function(args, done) {
        var action = null;

        // load the mongoose model for Teams
        Team = Team || dbConnection.models.teams;

        // create appropriate schema depending on input action
        createSchema(args.body)
            .then(function(schema) {

                // copy the action before deleting it from input
                action = args.body.action;
                delete args.body.action; // delete action from input

                // validate input against Joi schema
                return utils.checkInputParameters(args.body, schema);
            })
            .then(function() {
                // depending on action, call appropriate function
                switch (action) {
                    case 'id':
                    case 'fqdn':
                        return fetchTeam(args.body); // if action is 'fqdn' or 'id', call fetchTeam
                        break;
                    case 'list':
                        return getTeamList(options, args.body, dbConnection); // if action is 'list', call getTeamList
                }
            })
            .then(function(result) {
                sendResponse(result, done);
            })
            .catch(function (err) {
                console.log("Error in getTeam ---- ", err);

                // in case of error, print the error and send as response
                utils.senecaLog(seneca, 'error', __filename.split('/').pop(), err);

                // if the error message is formatted, send it as reply, else format it and then send
                done(null, {
                    statusCode: 200,
                    content: 'success' in err ? err : utils.error(err.id || 400, err.msg || 'Unexpected error', microtime.now())
                });
            })
    };
};