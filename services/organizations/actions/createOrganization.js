'use strict';

var utils = require(__base + 'sharedlib/utils');
var session = require(__base + 'sharedlib/session.js');
var Locale = require(__base + 'sharedlib/formatter.js');
var outputFormatter = new Locale(__base);
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var Organization = null;
var Session = null;
var subDomain = null;
var cloudfront = null;
var route53 = null;
var AWSCloud = require('aws-sdk');
var AWS = require('aws-sdk');
AWS.config.update({
    accessKeyId: process.env.R53_ACCESS_ID,
    secretAccessKey: process.env.R53_SECRET_KEY,
    region: process.env.R53_REGION
});


/**
 * @module createOrganization
 */

//Joi validation Schema
var schema = Joi.object().keys({
    name: Joi.string().required(),
    website: Joi.string().regex(/^(http\:\/\/|https\:\/\/)?([a-zA-Z0-9][a-z0-9\-]*\.)+[a-zA-Z0-9][a-zA-Z0-9\-]*/),
    description: Joi.string(),
    isSignUp: Joi.boolean(),
    subDomain: Joi.string().lowercase().required()
});

/**
 * Create a distribution on amazon cloud front
 * @method createCouldFrontDistribution
 * @param {String} domainName domain name for which organization is created
 * @returns {Promise} Promise containing amazon response if successful, else containing the error message
 */
function createCouldFrontDistribution(domainName) {
    return new Promise(function(resolve, reject) {
        var params = {
            DistributionConfig: {
                /* required */
                CallerReference: domainName, //'key-dev-app-org1.example.com', /* required */
                Comment: domainName.split('.')[0].toUpperCase(), //'KEY-DEV-APP-ORG1', /* required */
                DefaultCacheBehavior: {
                    /* required */
                    ForwardedValues: {
                        /* required */
                        Cookies: {
                            /* required */
                            Forward: 'none' /* required */
                        },
                        QueryString: false,
                        /* required */
                        Headers: {
                            Quantity: 0,
                            /* required */
                            Items: []
                        },
                        QueryStringCacheKeys: {
                            Quantity: 0,
                            /* required */
                            Items: []
                        }
                    },
                    MinTTL: process.env.CLOUD_FRONT_MIN_TTL, //120, /* required */
                    TargetOriginId: 'S3-' + domainName, //'S3-key-dev-app-org1.example.com', /* required */
                    TrustedSigners: {
                        /* required */
                        Enabled: false,
                        /* required */
                        Quantity: 0,
                        /* required */
                        Items: []
                    },
                    ViewerProtocolPolicy: 'redirect-to-https',
                    /* required */
                    AllowedMethods: {
                        Items: [ /* required */
                            'GET', 'HEAD'
                        ],
                        Quantity: 2,
                        /* required */
                        CachedMethods: {
                            Items: [ /* required */
                                'GET', 'HEAD'
                            ],
                            Quantity: 2 /* required */
                        }
                    },
                    Compress: false,
                    DefaultTTL: process.env.CLOUD_FRONT_DEFAULT_TTL, //120,
                    // LambdaFunctionAssociations: {
                    //   Quantity: 0, /* required */
                    //   Items: []
                    // },
                    MaxTTL: process.env.CLOUD_FRONT_MAX_TTL, //120,
                    SmoothStreaming: false
                },
                Enabled: true,
                /* required */
                Origins: {
                    /* required */
                    Quantity: 1,
                    /* required */
                    Items: [{
                        DomainName: process.env.CLOUD_FRONT_DOMAIN_NAME, //'key-dev-app.example.com.s3.amazonaws.com', /* required */
                        Id: 'S3-' + domainName, //'S3-key-dev-app-org1.example.com',/* required */
                        CustomHeaders: {
                            Quantity: 0,
                            /* required */
                            Items: []
                        },
                        S3OriginConfig: {
                            OriginAccessIdentity: '' /* required */
                        }
                    }]
                },
                Aliases: {
                    Quantity: 1,
                    /* required */
                    Items: [domainName]
                },
                CacheBehaviors: {
                    Quantity: 0,
                    /* required */
                    Items: []
                },
                CustomErrorResponses: {
                    Quantity: 0,
                    /* required */
                    Items: []
                },
                DefaultRootObject: 'index.html',
                // IsIPV6Enabled: true,
                PriceClass: 'PriceClass_All',
                Restrictions: {
                    GeoRestriction: {
                        /* required */
                        Quantity: 0,
                        /* required */
                        RestrictionType: 'none',
                        /* required */
                        Items: []
                    }
                },
                ViewerCertificate: {
                    Certificate: process.env.CLOUD_FRONT_VIEWER_CERT,
                    CertificateSource: 'iam',
                    IAMCertificateId: process.env.CLOUD_FRONT_IAM_CERT_ID,
                    MinimumProtocolVersion: 'TLSv1',
                    SSLSupportMethod: 'sni-only'
                },
                WebACLId: ''
            }
        };
        cloudfront.createDistribution(params, function(err, data) {
            if (err) {
                console.log('error createDistribution:---- ', err);
                if (err.code == 'DistributionAlreadyExists') { //check if Distribution Already Exists then find that Distribution
                    findMatchingDistribution({}, domainName)
                        .then(function(response) {
                            response.Distribution = { //format response as required by createRoute53ResourceRecordSet
                                Id: response.Id,
                                ARN: response.ARN,
                                Status: response.Status,
                                LastModifiedTime: response.LastModifiedTime,
                                DomainName: response.DomainName
                            };
                            resolve(response)
                        })
                        .catch(function(error) {
                            reject(error);
                        })
                } else {
                    reject({ id: 400, msg: err.message })
                }
            } else {
                console.log('data createDistribution:-----', JSON.stringify(data));
                resolve(data);
            }
        });
    })
}

/**
 * List all the distribution on cloud front and find distribution containing domain name
 * @method findMatchingDistribution
 * @param {Object} param used to get input parameters
 * @param {String} domainName domain for which distribution is to be fetched
 */
function findMatchingDistribution(param, domainName) {
    return new Promise(function(resolve, reject) {
        cloudfront.listDistributions(param, function(err, data) {
            if (err) {
                reject({ id: 400, msg: err.message });
            } else {
                console.log('\n\ndata listDistributions:-----', data);
                //find out distribution where sub-domain to be created is present
                var distribution = lodash.filter(data.DistributionList.Items, function(distribution) {
                    return lodash.indexOf(distribution.Aliases.Items, domainName) != -1;
                });

                //check if matching distribution are not found and result of listDistributions is Truncated then fetch next list
                if (lodash.isEmpty(distribution) && data.DistributionList.IsTruncated == true) {
                    var input = {
                        "Marker": data.DistributionList.NextMarker
                    };
                    findMatchingDistribution(input, domainName)
                } else {
                    console.log('matching distribution:- ', distribution);
                    if (lodash.isEmpty(distribution)) { //check if matching distribution is not found
                        reject({ id: 400, msg: 'No matching distribution found' })
                    } else {
                        resolve(distribution[0]);
                    }
                }
            }
        });
    });
}

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
                // console.log('getResourceRecordSet :-----', JSON.stringify(data));
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
                // console.log('inputParam:--- ', JSON.stringify(inputParam));
                route53.changeResourceRecordSets(inputParam, function(err, data) {
                    if (err) {
                        console.log('error ' + i + ':---- ', err);
                        reject({ id: 400, msg: err.message });
                    } else {
                        console.log('data deleted ' + i + ' :-----', data);
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
        cloudFrontResponse = JSON.parse(JSON.stringify(cloudFrontResponse));
        var outputData = { //amazon response to be stored in database
            cloudFrontResponse: {
                Distribution: {}
            }
        };

        if (!lodash.isEmpty(cloudFrontResponse)) {
            outputData.cloudFrontResponse = { //cloud front response to be stored in database
                Distribution: {
                    Id: cloudFrontResponse.Distribution.Id,
                    DomainName: cloudFrontResponse.Distribution.DomainName,
                    Status: cloudFrontResponse.Distribution.Status,
                    LastModifiedTime: cloudFrontResponse.Distribution.LastModifiedTime,
                    ARN: cloudFrontResponse.Distribution.ARN
                },
                ETag: cloudFrontResponse.ETag,
                Comment: cloudFrontResponse.Comment,
                Location: cloudFrontResponse.Location
            };
        }
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
                            "Value": cloudFrontResponse.Distribution ?
                                cloudFrontResponse.Distribution.DomainName : process.env.CLOUD_FRONT_DEFAULT_DOMAIN //process.env.R53_ALIAS_APP_URL
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
                            outputData.route53Response = data;
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
 * Save Organization details in database
 * @method createOrganization
 * @param {Object} input Used to get input parameters
 * @param {String} ownerId Used to get Id of user
 * @param {Object} amazonResponse Used to get result from amazon Route53 and cloud front
 * @param {Seneca} seneca seneca instance
 * @returns {Promise} Promise containing created Organization document if successful, else containing
 * the error message
 */
function createOrganization(ownerId, input, amazonResponse, seneca) {
    return new Promise(function(resolve, reject) {
        var data = {
            ownerId: ownerId,
            fqdn: subDomain
                // route53Response: amazonResponse.route53Response,
                // cloudFrontResponse: amazonResponse.cloudFrontResponse
        };
        data = lodash.assign(data, input);

        Organization.create(data)
            .then(function(saveResponse) {
                var header = utils.createMsJWT({ isMicroservice: true }); //create microservice token
                // updateUser(ownerId, header, seneca);
                resolve(saveResponse);
            })
            .catch(function (err) {
                console.log("Error in create --- ", err);
                if (err.code == 'E_VALIDATION') { //check if duplicate sub domain is used to create a new organization
                    reject({ id: 400, msg: "Sub Domain already exists." });
                } else {
                    reject({ id: 400, msg: err.message || err });
                }
            })
    });
}

/**
 * Give microservice call to create general department
 * @method createGenDept
 * @param {Object} header input header
 * @param {Seneca} seneca seneca instance
 */
function createGenDept(header, seneca) {
    utils.microServiceCall(seneca, 'ugrp', 'createDepartment', { name: 'general' }, header, null);
}

/**
 * Give microservice call to add user to organization
 * @method addToUserOrg
 * @param {String} orgId organizationId
 * @param {String} userId userId
 * @param {Object} header input header
 * @param {Seneca} seneca seneca instance
 */
function addToUserOrg(orgId, userId, header, seneca) {
    utils.microServiceCall(seneca, 'ugrp', 'addOrganization', { userId: userId, orgId: orgId }, header, null);
}

/**
 * Give microservice call to update user
 * @method updateUser
 * @param {String} userId userId
 * @param {Object} header input header
 * @param {Seneca} seneca seneca instance
 */
function updateUser(userId, header, seneca) {
    utils.microServiceCall(seneca, 'ugrp', 'updateUser', { userId: userId, registrationStep: 3 }, header, null);
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
            content: outputFormatter.format(true, 2030, result, 'Organization')
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

        // load waterline models for organization and session
        Organization = Organization || dbConnection.models.organizations;
        // Session = Session || ontology.collections.sessions;
        if (args.body.name) { //check if name is present
            args.body.name = args.body.name.toLowerCase();
        }
        var decodedHeader = null;
        utils.checkInputParameters(args.body, schema)
            .then(function () {
                console.log("reached checkifauthroized");
                return utils.checkIfAuthorized(args.credentials);
            })
            .then(function () {
                console.log("reached cloudfront check");
                decodedHeader = args.credentials;
                subDomain = args.body.subDomain + '.' + process.env.DOMAIN; //form complete url for sub-domain
                subDomain = subDomain.toLowerCase(); //convert sub-domain to lower case as CNAME is required small in cloud
                // front create distribution
                if (process.env.CLOUD_FRONT_ACCESS == 'true' && process.env.R53_ACCESS == 'true') { //check if
                    //  CLOUD_FRONT_ACCESS and R53_ACCESS is true
                    route53 = new AWS.Route53();
                    AWSCloud.config.update({
                        accessKeyId: process.env.CLOUD_FRONT_ACCESS_ID,
                        secretAccessKey: process.env.CLOUD_FRONT_SECRET_KEY,
                        region: process.env.CLOUD_FRONT_REGION
                    });
                    cloudfront = new AWSCloud.CloudFront({ apiVersion: process.env.CLOUD_FRONT_API_VERSION });
                    return createCouldFrontDistribution(subDomain)
                } else {
                    return new Promise(function(resolve, reject) {
                        if (process.env.R53_ACCESS == 'false' && process.env.CLOUD_FRONT_ACCESS == 'true') { //check if
                            //  CLOUD_FRONT_ACCESS is true and R53_ACCESS is false
                            reject({ id: 400, msg: 'Route53 Access should be enabled when Cloud Front Access is enabled' })
                        } else {
                            resolve(true);
                        }
                    });
                }
            })
            .then(function (response) {
                console.log("reached route53 check");
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
            .then(function (response) {
                console.log("reached createOrg");
                return createOrganization(decodedHeader.userId, args.body, response, seneca);
            })
            /*.then(function(response) {
                response.registrationStep = 3;
                var data = { //data to be stored in JWT token
                    isMicroservice: true,
                    orgId: response.orgId,
                    isOwner: true
                };
                var header = utils.createMsJWT(data);

                if (args.body.isSignUp) { //check if request is from sign-up then create new session for the sub-domain
                    var port = args.header.origin.split(":");
                    args.header.origin = args.header.origin.split("://")[0] + '://' + response.fqdn;
                    if (process.env.SYSENV == 'local') { //check if SYSENV is local
                        args.header.origin = args.header.origin + ':' + port[port.length - 1]; //add port number where project is
                        // deployed
                    }
                    decodedHeader.orgId = response.orgId;
                    utils.createJWT(decodedHeader, args.header)
                        .then(function(result) {
                            response.token = result.output.token;
                            return session.createSession(Session, result.output.token, result.sessionData);
                        })
                        .then(function() {
                            // TODO: Uncomment on adding groups functionality
                            // createGenGroup(header, seneca);
                            addToUserOrg(response.orgId, response.ownerId, header, seneca);
                            return sendResponse(response, done);
                        })
                } else {
                    // TODO: Uncomment on adding groups functionality
                    // createGenGroup(header, seneca);
                    addToUserOrg(response.orgId, response.ownerId, header, seneca);
                    return sendResponse(response, done);
                }
            })*/
            .then(function (response) {
                console.log("reached send");
                var data = { //data to be stored in JWT token
                    isMicroservice: true,
                    orgId: response.orgId,
                    isOwner: true
                };
                var header = utils.createMsJWT(data);
                addToUserOrg(response.orgId, response.ownerId, header, seneca);
                sendResponse(response, done);
            })
            .catch(function(err) {
                console.log('err in create organisation--- ', err);

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