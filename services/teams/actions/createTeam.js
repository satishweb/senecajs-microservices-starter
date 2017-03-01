'use strict';

var utils = require(__base + 'sharedlib/utils');
var session = require(__base + 'sharedlib/session.js');
var Locale = require(__base + 'sharedlib/formatter.js');
var outputFormatter = new Locale(__base);
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var Team = null;
var Group = null;
var User = null;
var subDomain = null;
var route53 = null;
var AWS = require('aws-sdk');
AWS.config.update({
    accessKeyId: process.env.R53_ACCESS_ID,
    secretAccessKey: process.env.R53_SECRET_KEY,
    region: process.env.R53_REGION
});


/**
 * @module createTeam
 */

//Joi validation Schema
var schema = Joi.object().keys({
    name: Joi.string().required(),
    website: Joi.string().regex(/^(http\:\/\/|https\:\/\/)?([a-zA-Z0-9][a-z0-9\-]*\.)+[a-zA-Z0-9][a-zA-Z0-9\-]*/),
    description: Joi.string(),
    subDomain: Joi.string().lowercase().required()
});

/**
 * Get list of resource record set from Amazon Route53
 * @method getResourceRecordSet
 * @param {Object} input used to get input parameters
 * @returns {Promise} Promise containing amazon response if successful, else containing the error message
 */
function getResourceRecordSet(input) {
    return new Promise(function(resolve, reject) {
        var inputParam = {
            HostedZoneId: process.env.R53_ZONE_ID,
            StartRecordName: input.subDomain + '.' + process.env.DOMAIN
        };

        route53.listResourceRecordSets(inputParam, function(err, data) {
            if (err) {
                reject({ id: 400, msg: err.message });
            } else {
                resolve(data.ResourceRecordSets)
            }
        });
    });
}

/**
 * Check if only one matching record set is present then move ahead else delete all matching record set from amazon
 * Route53
 * @method checkIfRecordSetPresent
 * @param {Object} data used to get resource record set from amazon
 * @param {String} filterName sub-domain name to be created
 * @param {Object} createRecordObject object used to create Resource Record Set
 * @returns {Promise} Promise containing sub-domain name if successful, else containing the error message
 */
function checkIfRecordSetPresent(data, filterName, createRecordObject) {
    return new Promise(function(resolve, reject) {
        var filteredData = lodash.filter(data, { Name: filterName });
        console.log('filteredData:-- ', JSON.stringify(filteredData));
        if (lodash.isEmpty(filteredData)) { //check if filteredData is empty or null
            resolve(false);
        } else if (filteredData.length == 1 && lodash.isEqual(filteredData[0], createRecordObject)) { //check if only one
            // matching record set is present
            resolve(true)
        } else {
            filteredData.forEach(function(resource, i) {
                var inputParam = {
                    "HostedZoneId": process.env.R53_ZONE_ID,
                    "ChangeBatch": {
                        "Changes": [{
                            "Action": "DELETE",
                            "ResourceRecordSet": {
                                "Name": resource.Name,
                                "Type": resource.Type,
                                "TTL": resource.TTL,
                                "ResourceRecords": resource.ResourceRecords
                            }
                        }]
                    }
                };
                if (resource.AliasTarget) {
                    inputParam.ChangeBatch.Changes[0].AliasTarget = resource.AliasTarget;
                }
                route53.changeResourceRecordSets(inputParam, function(err, data) {
                    if (err) {
                        reject({ id: 400, msg: err.message });
                    } else {
                        if ((filteredData.length - 1) == i) {
                            resolve(filterName);
                        }
                    }
                });
            })
        }
    });
}

/**
 * Make entry in resource record set of Amazon Route53
 * @method createRoute53ResourceRecordSet
 * @param {Object} input used to get input parameters
 * @param {Object} cloudFrontResponse used to get cloud front response of create distribution
 * @returns {Promise} Promise containing amazon response if successful, else containing the error message
 */
function createRoute53ResourceRecordSet(input, cloudFrontResponse) {
    return new Promise(function(resolve, reject) {
        var inputParams = {
            "HostedZoneId": process.env.R53_ZONE_ID,
            "ChangeBatch": {
                "Changes": [{
                    "Action": "UPSERT",
                    "ResourceRecordSet": {
                        "Name": subDomain,
                        "Type": "CNAME",
                        "TTL": 300,
                        "ResourceRecords": [{
                            "Value": process.env.CLOUD_FRONT_DEFAULT_DOMAIN //process.env.R53_ALIAS_APP_URL
                        }]
                    }
                }]
            }
        };

        getResourceRecordSet(input)
            .then(function(response) {
                var filterName = inputParams.ChangeBatch.Changes[0].Name + '.';
                return checkIfRecordSetPresent(response, filterName, inputParams)
            })
            .then(function(response) {
                if (response === true) { //check if response is true then don't create resource record set
                    resolve(null)
                } else {
                    route53.changeResourceRecordSets(inputParams, function(err, data) {
                        if (err) {
                            reject({ id: 400, msg: err.message });
                        } else {
                            var outputData = { route53Response: data };
                            resolve(outputData)
                        }
                    });
                }
            })
            .catch(function(error) {
                reject(error)
            })
    })
}

/**
 * Save Team details in database
 * @method createTeam
 * @param {Object} input Used to get input parameters
 * @param {String} ownerId Used to get Id of user
 * @param {Object} amazonResponse Used to get result from amazon Route53 and cloud front
 * @param {Seneca} seneca seneca instance
 * @returns {Promise} Promise containing created Team document if successful, else containing
 * the error message
 */
function createTeam(ownerId, input, amazonResponse, seneca) {
    return new Promise(function(resolve, reject) {

        // create team data using fields not present in input
        var data = {
            ownerId: ownerId,
            fqdn: subDomain,
            route53Response: amazonResponse.route53Response,
            groups: [{
                name: 'Users',
                description: 'Default Users group',
                ownerId: ownerId
            }, {
                name: 'Admins',
                description: 'Default Admins group',
                ownerId: ownerId
            }]
        };

        // merge with input fields
        data = lodash.assign(data, input);

        // save data to database        
        Team.create(data, { include: [{ model: Group, as: 'groups' }] })
            .then(function(saveResponse) {
                resolve(saveResponse);
            })
            .catch(function(err) {
                if (err.parent && err.parent.code == 23505) { // check if duplicate sub domain is used to create a new team
                    reject({ id: 400, msg: "Sub Domain already exists." });
                } else {
                    reject({ id: 400, msg: err.errors ? err.errors[0].message : err.message || err });
                }
            })
    });
}


/**
 * Updates the 
 * @method updateUserRegistration
 * @param {Number} userId 
 */
function updateUserRegistration(userId) {
    User.update({ registrationStep: 3 }, { where: { userId: userId } })
}

/**
 * Formats the output response and returns the response
 * @method sendResponse
 * @param {String} result The final result to be returned, contains the token created
 * @param {Function} done The done formats and sends the response
 */
function sendResponse(result, done) {
    if (result !== null) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2030, result, 'Team')
        });
    } else {
        //else return error
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 102)
        });
    }
}


module.exports = function(options) {
    var seneca = options.seneca;
    var dbConnection = options.dbConnection;
    return function(args, done) {

        // load database models for team and session
        Team = Team || dbConnection.models.teams;
        User = User || dbConnection.models.users;
        Group = Group || dbConnection.models.groups;

        if (args.body.name) { //check if name is present
            args.body.name = args.body.name.toLowerCase();
        }
        var decodedHeader = null;
        utils.checkInputParameters(args.body, schema)
            .then(function() {
                return utils.checkIfAuthorized(args.credentials, false, false);
            })
            .then(function() {
                decodedHeader = args.credentials;
                subDomain = args.body.subDomain + '.' + process.env.DOMAIN; //form complete url for sub-domain
                subDomain = subDomain.toLowerCase(); //convert sub-domain to lower case as CNAME is required small in cloud
                // front create distribution
                if (process.env.R53_ACCESS == 'true') { //check if R53_ACCESS is true
                    AWS.config.update({
                        accessKeyId: process.env.R53_ACCESS_ID,
                        secretAccessKey: process.env.R53_SECRET_KEY,
                        region: process.env.R53_REGION
                    });
                    return createRoute53ResourceRecordSet(args.body, response);
                } else {
                    return new Promise(function(resolve) {
                        resolve(true);
                    })
                }
            })
            .then(function(response) {
                return createTeam(args.credentials.userId, args.body, response, seneca);
            })
            .then(function(response) {
                response.registrationStep = 3;
                updateUserRegistration(args.credentials.userId);
                return sendResponse(response, done);
            })
            .catch(function(err) {
                console.log('err in create organisation--- ', err);

                // in case of error, print the error
                utils.senecaLog(seneca, 'error', __filename.split('/').pop(), err);

                // if the error message is formatted, send it as reply, else format it and then send
                done(null, {
                    statusCode: 200,
                    content: 'success' in err ? err : utils.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};