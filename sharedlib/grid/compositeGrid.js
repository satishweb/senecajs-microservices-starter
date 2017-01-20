'use strict';

var ApiGrid = require("./apiGrid.js");
var CollectionGrid = require("./collectionGrid.js");
var OutputFormatter = require('./outputFormatter.js');
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var jwt = require('jsonwebtoken');

function CompositeGrid(inputObj, config, apiName, database, seneca) {
  this.validateInputs(inputObj);
  this.apiName = apiName;
  this.config = config;
  this.database = database;
  this.input = inputObj;
  this.seneca = seneca;
  this.collectionGrids = [];
  this.apiGrids = [];
  // console.log("config ----- ", config[apiName]);
  this.collections = lodash.keys(config[apiName].collections);
  this.apis = lodash.keys(config[apiName].apis);
  // console.log("Collection array ---- ", this.collections);
  // console.log("APIs array ------", this.apis);
  this.init();
  this.outputFormatter = new OutputFormatter();
}

CompositeGrid.prototype.init = function () {
  var grid = this;
  this.collections.forEach(function (collection) {
    grid.collectionGrids.push(
      new CollectionGrid(grid.input, collection, grid.config[grid.apiName].collections[collection], grid.database));
  });
  this.apis.forEach(function (api) {
    grid.apiGrids.push(new ApiGrid(grid.input, api, grid.config[grid.apiName].apis[api], grid.seneca));
  });
};

/**
 * Fetches result from MongoDB and gives formatted output
 * @returns {Promise} Returns Promise with proper error messages if any
 */
CompositeGrid.prototype.fetch = function () {
  var grid = this; //make Grid accessible inside Promise
  var result = null;
  return new Promise(function (resolve, reject) {
    grid.mergeSecondaryFilter()
      .then(function () {
        return grid.collectionGrids[0].fetch();
      }).then(function (primaryResult) {
        result = primaryResult;
      // console.log("Result in before merging ---- ", result);
      return grid.mergeOutput(result.data);
      }).then(function (mergedResult) {
      // console.log("Result in compositeGrid fetch ---- ", mergedResult);
      result.data = mergedResult;
        return grid.mergeConfigs();
      }).then(function (configs) {
        resolve(
          grid.outputFormatter.formatOutput(grid.input, configs, result.data, result.pagination, grid.collectionGrids[0].fieldConfig.projections)
      );
    }).catch(function (err) {
      // resolve(grid.outputFormatter.formatOutput(grid.input, [], grid.collectionGrids[0].Query.pagination,
      //   grid.collectionGrids[0].fieldConfig.projections));
      reject(err);
    });
  });
};

/**
 * Fetch search data from secondary databases and merge the response in query filter
 * @method mergeSecondaryFilter
 * @memberOf Grid
 * @returns {Promise} Returns Promise with proper error messages if any.
 */
CompositeGrid.prototype.mergeSecondaryFilter = function () {
  var grid = this;
  var filters = [];
  var query = [];
  var size = grid.apiGrids.length;
  var apiSuccess = true;
  return new Promise(function (resolve, reject) {
    if (size === 0) {
      resolve(null);
    }
    // loop to call searchSecondary for all APIs
    grid.apiGrids.forEach(function (apiGrid) {
      apiGrid.fetch()
        .then(function (result) {
          // console.log('result of secondary in grid---?>>> ', JSON.stringify(result));
          size--;
          if (!result) {

          } else if (lodash.isEmpty(result.secondaryFilter) && lodash.isEmpty(result.secondaryQuery)) {
            apiSuccess = false;
          } else {
            filters = lodash.concat(filters, result.secondaryFilter);
            query = lodash.concat(query, result.secondaryQuery);
          }
          if (size === 0 && apiSuccess) {
            // console.log('filter--- ', filters, ' query --- ', query);
            grid.collectionGrids[0].updateQuery(filters, query);
            resolve();
          } else if (size === 0) {
            reject("No output found....");
          }
        });
    });
  });
};

/**
 * Merge the search result data with data from dependent collections.
 * @method mergeOutput
 * @memberOf Grid
 * @returns {Promise} Returns Promise with proper error messages if any
 */
CompositeGrid.prototype.mergeOutput = function (result) {
  var grid = this;
  return new Promise(function (resolve, reject) {
    var size = grid.apiGrids.length;  // Number of fields in output to merge
    if (size === 0) {
      // console.log("No merging required as apiGrid.length = 0.", result);
      resolve(result);
    } else {
      grid.apiGrids.forEach(function (apiGrid) {
        apiGrid.getMergeData(grid.collectionGrids[0].resultArr)
          .then(function (response) {
            // console.log("Collection result ---- ", grid.collectionGrids[0].resultArr);
            // console.log("Merge Data --- ", response);
            grid.collectionGrids[0].resultArr.forEach(function (item, i) {
              grid.collectionGrids[0].resultArr[i] = lodash.merge(item, response.result[item[response.primaryKey]]);
            });
            size--;
            if (size === 0) {
              resolve();  // Resolve if all fields have been merged
            }
          }).catch(function (error) {
            size--;
            if (size === 0) {
              reject();  // Resolve if all fields have been merged
            }
          });
      });
    }
  });
};

CompositeGrid.prototype.mergeConfigs = function () {
  var grid = this;
  var config = {};
  return new Promise (function (resolve) {
    grid.collectionGrids.forEach(function (collectionGrid) {
      lodash.merge(config, collectionGrid.fieldConfig.configurations);
    });
    grid.apiGrids.forEach(function (apiGrid) {
      lodash.merge(config, apiGrid.secondaryData.config);
    });
    // console.log("Configurations --- ", config);
    resolve(config);
  });
};

/**
 *
 * @param input
 */
CompositeGrid.prototype.validateInputs = function (input) {
  var inputSchema = Joi.object().keys({
    searchKeyword: Joi.object(),
    filter       : Joi.object(),
    range        : Joi.object(),
    sort         : Joi.object(),
    page         : Joi.number(),
    limit        : Joi.number()
  });
  Joi.validate(input, inputSchema, function (err) {
    if (err) {
      throw new Error("Invalid input, " + err.details[0].message);
    }
  });
};


module.exports = CompositeGrid;