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
    this.collectionName = collectionName;
    this.database = database;
    this.Query = new Query(this.fieldConfig, inputObj);
    this.resultArr = [];
}

/**
 *
 * @param input
 */
CollectionGrid.prototype.validateInputs = function(input) {
    var inputSchema = Joi.object().keys({
        searchKeyword: Joi.object(),
        filter: Joi.object(),
        range: Joi.object(),
        sort: Joi.object(),
        page: Joi.number(),
        limit: Joi.number()
    });
    Joi.validate(input, inputSchema, function(err) {
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
CollectionGrid.prototype.formQueryString = function() {
    var grid = this;
    return new Promise(function(resolve, reject) {
        grid.Query.renderProjection(grid.Query.projection); // setting projection property
        grid.Query.renderSearch(grid.Query.conditions.search, grid.Query.conditions.query); // setting search property
        grid.Query.renderFilter(grid.Query.conditions.filters); // setting filter property
        grid.Query.renderRange(grid.Query.conditions.range); // setting range property
        grid.Query.renderSort(grid.Query.sort); // setting sort property
        grid.Query.renderPagination(grid.Query.pagination); // setting pagination property
        grid.Query.renderInclude(grid.fieldConfig.configurations);
        // console.log('Query -- ++ == ', JSON.stringify(grid.Query));
        resolve();
    });
};

/**
 * Executes the query and returns result set.
 * @returns {Promise} Returns Promise with proper error messages if any.
 */
CollectionGrid.prototype.executeQuery = function() {
    this.resultArr = []; //result array to store output from query
    var gridObject = this;
    var totalCount = 0;
    return new Promise(function(resolve, reject) {
        var findObject = {};
        if (lodash.isEmpty(gridObject.Query.conditions.query) !== true) {
            findObject.$or ? null : findObject.$or = [];
            // console.log("Inside query ---- findObject ---- ", findObject);
            findObject.$or = lodash.concat(findObject.$or, gridObject.Query.conditions.query); //checking if query property is empty or not
            // console.log("After adding query ---- findObject ---- ", findObject);
        }
        lodash.isEmpty(gridObject.Query.conditions.search) !==
            true ? lodash.assignIn(findObject, gridObject.Query.conditions.search) : null; //checking if search property is empty or not
        lodash.isEmpty(gridObject.Query.conditions.filters) !==
            true ? lodash.assignIn(findObject, gridObject.Query.conditions.filters) : null; //checking if filter property is empty or not
        lodash.isEmpty(gridObject.Query.conditions.range) !==
            true ? lodash.assignIn(findObject, gridObject.Query.conditions.range) : null; //checking if range property is empty or not
        // var include = lodash.values(gridObject.Query.include);
        var associations = [];
        var sort = [];

        // console.log("Sort before modifying ---- ", gridObject.Query.sort);
        for (var field in gridObject.Query.include) {
            if (gridObject.Query.include.hasOwnProperty(field)) {
                var join = gridObject.Query.include[field];
                var temp = { model: gridObject.database.models[join.model] };
                if (join.as) {
                    temp.as = join.as;
                }
                temp.duplicating = false;
                // console.log("temp --- ", temp, "\nfield ---- ", field);
                if (gridObject.Query.sort[field]) {
                    var sortTemp = lodash.concat(temp, gridObject.Query.sort[field]);
                    // console.log("adding join for sort for ", field);
                    sort.push(sortTemp);
                    delete gridObject.Query.sort[field];
                }
                if (join.attributes) {
                  temp.attributes = join.attributes;
                }
                associations.push(temp);
            }
        }
        sort = lodash.concat(sort, lodash.values(gridObject.Query.sort));
        // console.log("Query after joining ----- ", JSON.stringify(findObject), associations, "sort ----- ", sort, gridObject.Query.sort, gridObject.Query.pagination.limit, gridObject.Query.pagination.skip);
        //first find count of document matched and then fetch result set using pagination

        gridObject.database.models[gridObject.collectionName].findAndCountAll({

          distinct: true,
          where: findObject,
          include: associations,
          order: sort,
        //   limit: gridObject.Query.pagination.limit,
        //   offset: gridObject.Query.pagination.skip
        })
            .then(function(result) {
                // console.log("result ---- ", JSON.stringify(result));
                gridObject.Query.pagination.total = result.count;
                gridObject.resultArr = result.rows.slice(gridObject.Query.pagination.skip, gridObject.Query.pagination.skip+gridObject.Query.pagination.limit); //assigning result fetched from database to to resultArr
                resolve(gridObject.resultArr);
            })
            .catch(function(err) {
                reject({ id: 400, msg: err });
            });
    });
};

/**
 * Fetches result from MongoDB and gives formatted output
 * @returns {Promise} Returns Promise with proper error messages if any
 */
CollectionGrid.prototype.fetch = function() {
    var grid = this; //make Grid accessible inside Promise
    return new Promise(function(resolve, reject) {
        // console.log("Query errors in grid ---- ", grid.Query.errorMessages, !lodash.isEmpty(grid.Query.errorMessages));
        if (!lodash.isEmpty(grid.Query.errorMessages)) {
            reject({ id: 400, msg: grid.Query.errorMessages });
        } else {
            grid.formQueryString()
                .then(function() {
                    return grid.executeQuery();
                })
                .then(function(queryResult) {
                    resolve({ data: queryResult, pagination: grid.Query.pagination });
                })
                .catch(function(err) {
                    reject({ id: 400, msg: err });
                });
        }
    });
};

/**
 * Fetches result from MongoDB and gives formatted output
 * @returns {Promise} Returns Promise with proper error messages if any
 */
CollectionGrid.prototype.updateQuery = function(filter, query) {
    if (!lodash.isEmpty(filter)) {
        this.Query.conditions.filters = lodash.concat(this.Query.conditions.filters || [], filter);
    }
    if (!lodash.isEmpty(query)) {
        this.Query.conditions.mergeQuery = lodash.concat(this.Query.conditions.mergeQuery || [], query);
    }
};

module.exports = CollectionGrid;