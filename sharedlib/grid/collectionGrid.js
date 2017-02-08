'use strict';

var FieldConfig = require("./collectionFieldConfig.js");
var Query = require('./queryFormatter.js');
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var jwt = require('jsonwebtoken');

/**
 * Initialises the Grid object with input and the configurations
 * @param {Object} inputObj use to get input parameters
 * @param {String} collectionName use to get collection name on which search is to be preformed
 * @param {Object} database use to get database connection
 * @constructor
 */
function CollectionGrid(inputObj, collectionName, collectionConfig, database) {
  this.validateInputs(inputObj);
  this.fieldConfig = new FieldConfig(collectionName, collectionConfig);
  this.input = inputObj;
  // this.database = database.collection(collectionName);
  this.database = database;
  this.Query = new Query(this.fieldConfig, inputObj);
  this.resultArr = [];
}

/**
 *
 * @param input
 */
CollectionGrid.prototype.validateInputs = function (input) {
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

/**
 * Creates Mongo query from the query Object and set them as property of Grid object
 * @method formQueryString
 * @memberOf Grid
 * @returns {Promise} Returns Promise with proper error messages if any.
 */
CollectionGrid.prototype.formQueryString = function () {
  var grid = this;
  return new Promise (function (resolve, reject) {
    grid.Query.renderProjection(grid.Query.projection);// setting projection property
    grid.Query.renderSearch(grid.Query.conditions.search, grid.Query.conditions.query);// setting search property
    grid.Query.renderFilter(grid.Query.conditions.filters);// setting filter property
    grid.Query.renderRange(grid.Query.conditions.range);// setting range property
    grid.Query.renderSort(grid.Query.sort);// setting sort property
    grid.Query.renderPagination(grid.Query.pagination);// setting pagination property
    // console.log('Query -- ++ == ', JSON.stringify(grid.Query));
    resolve();
  });
};

/**
 * Executes the query and returns result set.
 * @returns {Promise} Returns Promise with proper error messages if any.
 */
CollectionGrid.prototype.executeQuery = function () {
  this.resultArr = [];//result array to store output from query
  var gridObject = this;
  var totalCount = 0;
  return new Promise(function (resolve, reject) {
    var findObject = {};
    if(lodash.isEmpty(gridObject.Query.conditions.query) !== true) {
      findObject.or ? null : findObject.or = [];
      // console.log("Inside query ---- findObject ---- ", findObject);
      findObject.or = lodash.concat(findObject.or, gridObject.Query.conditions.query); //checking if query property is empty or not
      // console.log("After adding query ---- findObject ---- ", findObject);
    }
    lodash.isEmpty(gridObject.Query.conditions.search) !==
    true ? lodash.assignIn(findObject, gridObject.Query.conditions.search) : null;//checking if search property is empty or not
    lodash.isEmpty(gridObject.Query.conditions.filters) !==
    true ? lodash.assignIn(findObject, gridObject.Query.conditions.filters) : null;//checking if filter property is empty or not
    lodash.isEmpty(gridObject.Query.conditions.range) !==
    true ? lodash.assignIn(findObject, gridObject.Query.conditions.range) : null;//checking if range property is empty or not
    // console.log("Query after joining ----- ", JSON.stringify(findObject));
    //first find count of document matched and then fetch result set using pagination
    gridObject.database.count(findObject)
      .then(function (count) {
        totalCount = count;
        if (lodash.isEmpty(gridObject.Query.sort)) {//checking if sort property is empty or not
          return gridObject.database.find({
            select: gridObject.Query.projection,
            where: findObject,
            skip: gridObject.Query.pagination.skip,
            limit: gridObject.Query.pagination.limit
          })
        } else {
          return gridObject.database.find({
            select: gridObject.Query.projection,
            where: findObject,
            skip: gridObject.Query.pagination.skip,
            limit: gridObject.Query.pagination.limit,
            sort: gridObject.Query.sort
          })
        }
      })  
      .then(function (response) {
        // console.log('result after executing query --- ', response);
        gridObject.Query.pagination.total = totalCount;
        gridObject.resultArr = response;//assigning result fetched from database to to resultArr
        resolve(gridObject.resultArr);
      })
      .catch(function (err) {
        reject({ id: 400, msg: err });
      });
  });
};

/**
 * Fetches result from MongoDB and gives formatted output
 * @returns {Promise} Returns Promise with proper error messages if any
 */
CollectionGrid.prototype.fetch = function () {
  var grid = this; //make Grid accessible inside Promise
  return new Promise(function (resolve, reject) {
    // console.log("Query errors in grid ---- ", grid.Query.errorMessages, !lodash.isEmpty(grid.Query.errorMessages));
    if (!lodash.isEmpty(grid.Query.errorMessages)) {
      reject({id: 400, msg:grid.Query.errorMessages});
    } else {
      grid.formQueryString()
        .then(function (){
          return grid.executeQuery();
        })
        .then(function (queryResult) {
          resolve({data: queryResult, pagination: grid.Query.pagination});
        })
        .catch(function (err) {
          reject({id: 400, msg: err});
        });
    }
  });
};

/**
 * Fetches result from MongoDB and gives formatted output
 * @returns {Promise} Returns Promise with proper error messages if any
 */
CollectionGrid.prototype.updateQuery = function (filter, query) {
  if (!lodash.isEmpty(filter)) {
    this.Query.conditions.filters = lodash.concat(this.Query.conditions.filters || [], filter);
  }
  if (!lodash.isEmpty(query)) {
    this.Query.conditions.mergeQuery = lodash.concat(this.Query.conditions.mergeQuery || [], query);
  }
};

module.exports = CollectionGrid;