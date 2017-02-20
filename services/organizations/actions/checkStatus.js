'use strict';

var utils = require(__base + 'sharedlib/utils');
var Locale = require(__base + 'sharedlib/formatter.js');
var outputFormatter = new Locale(__base);
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var Organization = null;
var AWS = require('aws-sdk');

/**
 * @module checkSubDomain
 */

//Joi validation Schema
var schema = Joi.object().keys({
    orgId: Joi.string(),
    subDomain: Joi.string()
}).xor('orgId', 'subDomain');

/**
 * Fetch organization details by organization Id
 * @method fetchOrganization
 * @param {String} input Contains the input parameters
 * @returns {Promise} Promise containing organization details if successful, else containing the error message
 */
function fetchOrganization(input) {
    return new Promise(function(resolve, reject) {
        var find = { where: {} };
        if (input.orgId) {
            find.where.orgId = input.orgId;
        } else if (input.subDomain) {
            find.where.subDomain = input.subDomain;
        }
        Organization.findOne(find)
            .then(function(findResult) {
                if (lodash.isEmpty(findResult)) {
                    reject({ id: 400, msg: 'Organization not found' });
                } else {
                    resolve(findResult);
                }
            })
            .catch(function(err) {
                reject({ id: 400, msg: err })
            })
    })
}

/**
 * @method updateOrganization
 * @param {String} orgId organization Id
 * @param {Object} update data to be updated
 */
function updateOrganization(org, update) {
    org.update(update)
        .then(function(updateResponse) {})
        .catch(function(err) {
            if (err) {
                console.log("error updating organization status", err);
            }
        })
}

/**
 * Check the status of Cloud front distribution on Amazon Cloud Front
 * @method checkCloudFrontStatus
 * @param {Object} orgDetails organization details fetched
 */
function checkCloudFrontStatus(orgDetails) {
  return new Promise(function (resolve, reject) {
    AWS.config.update({
      accessKeyId    : process.env.CLOUD_FRONT_ACCESS_ID,
      secretAccessKey: process.env.CLOUD_FRONT_SECRET_KEY,
      region         : process.env.CLOUD_FRONT_REGION
    });
    var cloudfront = new AWS.CloudFront({apiVersion: process.env.CLOUD_FRONT_API_VERSION});
    
    //check if distribution Id is present in database
    if (orgDetails.cloudFrontResponse &&
      orgDetails.cloudFrontResponse.Distribution &&
      orgDetails.cloudFrontResponse.Distribution.Id) {
      var param = {
        Id: orgDetails.cloudFrontResponse.Distribution.Id
      };
      
      cloudfront.getDistribution(param, function (err, data) {
        if (err) {
          reject({id: 400, msg: err.message});
        } else {
          // console.log('data checkCloudFrontStatus:-----', JSON.stringify(data));
          updateOrganization(orgDetails.orgId, {'cloudFrontResponse.Distribution.Status': data.Distribution.Status});
          if (data.Distribution.Status == 'Deployed') {
            resolve({isUpdated: true})
          } else {
            resolve({isUpdated: false})
          }
        }
      });
    } else {
      resolve({isUpdated: true})
    }
  })
}

/**
 * Check if sub-domain has been deployed on amazon or not
 * @method checkDeploymentStatus
 * @param {Object} orgDetails use to get organization details
 */
function checkDeploymentStatus(orgDetails) {
    return new Promise(function(resolve, reject) {
        if (orgDetails.route53Response && orgDetails.route53Response.ChangeInfo && orgDetails.route53Response.ChangeInfo.Status == 'PENDING' && process.env.R53_ACCESS == 'true') { //check
            // if route53 change status is PENDING and  R53_ACCESS is true
            checkResourceRecordSetStatus(orgDetails)
                .then(function(response) {
                    if (response.isUpdated === true && process.env.CLOUD_FRONT_ACCESS == 'true') { //if route53 changes are
                        // reflected then check cloud front changes if CLOUD_FRONT_ACCESS is true
                        checkCloudFrontStatus(orgDetails)
                            .then(function(response) {
                                resolve(response);
                            })
                            .catch(function(error) {
                                reject(error);
                            })
                    } else {
                        resolve(response)
                    }
                })
                .catch(function(error) {
                    reject(error);
                })
        } else {
            resolve({ isUpdated: true });
        }
    })
}

/**
 * Check the status of Resource Record on Amazon Route53
 * @method checkResourceRecordSetStatus
 * @param {Object} orgDetails organization details fetched
 */
function checkResourceRecordSetStatus(orgDetails) {
    return new Promise(function(resolve, reject) {
        var route53 = new AWS.Route53();
        //check if route53 Id is present in database
        if (orgDetails.route53Response && orgDetails.route53Response.ChangeInfo && orgDetails.route53Response.ChangeInfo.Id) {
            var param = {
                Id: orgDetails.route53Response.ChangeInfo.Id
            };

            route53.getChange(param, function(err, data) {
                if (err) {
                    reject({ id: 400, msg: err.message });
                } else {
                    updateOrganization(orgDetails, { 'route53Response.ChangeInfo.Status': data.ChangeInfo.Status });
                    if (data.ChangeInfo.Status == 'INSYNC') {
                        resolve({ isUpdated: true })
                    } else {
                        resolve({ isUpdated: false })
                    }
                }
            });
        } else {
            resolve({ isUpdated: true })
        }
    })
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
            content: outputFormatter.format(true, 2000, result, 'Organization Deployment Status')
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
        Organization = Organization || dbConnection.models.organizations;
        AWS.config.update({
            accessKeyId: process.env.R53_ACCESS_ID,
            secretAccessKey: process.env.R53_SECRET_KEY,
            region: process.env.R53_REGION
        });
        var orgDetails = null;
        utils.checkInputParameters(args.body, schema)
            .then(function() {
                return utils.checkIfAuthorized(args.credentials);
            })
            .then(function() {
                return fetchOrganization(args.body);
            })
            .then(function (response) {
                console.log("Response of fetchOrg --- ", response);
                orgDetails = response;
                return checkDeploymentStatus(response);
            })
            .then(function (response) {
                response = Object.assign(response, orgDetails.toJSON());
                sendResponse(response, done);
            })
            .catch(function(err) {
                console.log("Error in checkStatus ---- ", err);
                // in case of error, print the error
                utils.senecaLog(seneca, 'error', __filename.split('/').pop(), err);

                // if the error message is formatted, send it as reply, else format it and then send
                done(null, {
                    statusCode: 200,
                    content: err.success === true || err.success === false ? err : utils.error(err.id || 400, err ? err.msg : 'Unexpected error', microtime.now())
                });
            });
    };
};