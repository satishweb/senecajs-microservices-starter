'use strict';

var FieldConfig = require("./apiFieldConfig.js");
var ApiCallFormatter = require("./apiCallFormatter.js");
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var jwt = require('jsonwebtoken');

function ApiGrid(inputObj, collectionName, collectionConfig, seneca) {
  this.fieldConfig = new FieldConfig(collectionConfig);
  this.apiCallFormatter = new ApiCallFormatter(this.fieldConfig, inputObj);
  this.input = inputObj;
  this.seneca = seneca;
  this.secondaryData = {};
  this.apiCall = {};
}

/**
 * 
 */
ApiGrid.prototype.init = function () {
  this.apiCall = this.fieldConfig.prepareApiCall();
  this.apiCall.body = this.apiCallFormatter.renderApiCall();
  console.log("API CALL ------ ", this.apiCall);
};

/**
 * Fetches result from MongoDB and gives formatted output
 * @returns {Promise} Returns Promise with proper error messages if any
 */
ApiGrid.prototype.fetch = function () {
  var grid = this; //make Grid accessible inside Promise
  return new Promise(function (resolve, reject) {
    grid.init();
    console.log('grid.apiCall.body== ', grid.apiCall.body);
    if (lodash.isEmpty(grid.apiCall.body)) {
      resolve();
    } else {
      resolve(grid.searchSecondary(grid.apiCall, grid.seneca));
    }
  });
};

ApiGrid.prototype.searchSecondary = function (api, seneca) {
  var apiGrid = this;
  var secondaryFilter = [];
  var secondaryQuery = [];
  return new Promise(function (resolve, reject) {
    apiGrid.callMicroservice(api.role, api.cmd, api.body, seneca)
      .then(function (response) {
        console.log("Secondary result ---- ", response);
        var temp = {};
        apiGrid.secondaryData = response;
        if (!lodash.isEmpty(response)) {
          if (api.body.searchKeyword.query) {
            temp[apiGrid.fieldConfig.configurations.primaryKey] = {'$in': lodash.map(response, apiGrid.fieldConfig.configurations.foreignKey)};
            secondaryQuery.push(temp);
          } else {
            temp[apiGrid.fieldConfig.configurations.primaryKey] = lodash.map(response, apiGrid.fieldConfig.configurations.foreignKey);
            secondaryFilter.push(temp);
          }
        }
        resolve({secondaryFilter: secondaryFilter, secondaryQuery: secondaryQuery});
      });
  });
};

ApiGrid.prototype.getMergeData = function (primaryResult) {
  var apiGrid = this;
  return new Promise(function (resolve, reject) {
    if (lodash.isEmpty(apiGrid.apiCall.body) || (lodash.keys(apiGrid.apiCall.body).length === 1 &&
      apiGrid.apiCall.body.searchKeyword && lodash.keys(apiGrid.apiCall.body.searchKeyword).length === 1 &&
      apiGrid.apiCall.body.searchKeyword.query)) {
      console.log("Fetching secondary data for merging output...");
      // create input with foreign keys in filter
      apiGrid.apiCall.body.filter[apiGrid.fieldConfig.configurations.foreignKey] =
        lodash.pull(lodash.uniqBy(lodash.map(primaryResult, apiGrid.fieldConfig.configurations.primaryKey)), undefined);
      console.log("New api call body ---- ", apiGrid.apiCall.body);
      // call microservice to fetch secondaryData
      apiGrid.callMicroservice(apiGrid.apiCall.role, apiGrid.apiCall.cmd, apiGrid.apiCall.body, apiGrid.seneca)
        .then(function (response) {
          // return fetched data
          console.log("Merge data result ---- ", response);
          apiGrid.secondaryData = lodash.keys(response, apiGrid.fieldConfig.configurations.foreignKey);
          resolve({result: apiGrid.secondaryData, primaryField: apiGrid.fieldConfig.configurations.primaryKey});
        });
    } else {
      // return secondary data
      console.log("Data already fetched for merging output.....");
      apiGrid.secondaryData = lodash.keys(apiGrid.secondaryData, apiGrid.fieldConfig.configurations.foreignKey);
      resolve({result: apiGrid.secondaryData, primaryField: apiGrid.fieldConfig.configurations.primaryKey});
    }
  });
};

/**
 * Call API and fetch data
 * @method callMicroservice
 * @memberOf FieldConfig
 * @param {String} role Name of microservice
 * @param {String} cmd  Name of API
 * @param {Object} body API input parameter
 * @returns {Promise} Returns Promise with proper error messages if any
 */
ApiGrid.prototype.callMicroservice = function (role, cmd, body, seneca) {
  return new Promise(function (resolve, reject) {
    // fetch product details for the input productIds
    try {
      seneca.client({
        type: 'beanstalk',
        pin : ['role:*,cmd:*'].join(''),
        host: process.env.QUEUE_HOST || '0.0.0.0'
      }).act({
        role  : role.toString(),
        cmd   : cmd.toString(),
        body  : body,
        header: createJwt()
      }, function (err, result) {
        if (err) {
          reject(err);
        } else {
          resolve(result.content.data);
        }
      });
    } catch (err) {
      console.log("Error in call --- ", err);
    }
  });
};

/**
 * Creates a JWT token.
 * @method createJWT
 * @returns {Object} Returns JWT token.
 *
 */
var createJwt = function () {
  var key = process.env.JWT_SECRET_KEY;
  var data = {"isMicroservice": true};
  var token = {};
  token.authorization = jwt.sign(data, key);
  return token;
};

module.exports = ApiGrid;