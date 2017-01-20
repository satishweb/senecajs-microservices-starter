'use strict';

var lodash = require('lodash');
var FieldConfig = require("./collectionFieldConfig.js");

/**
 * Initialise Query object to default properties
 * @constructor
 */
function Query(fieldConfig, inputObj) {
  if (!(fieldConfig instanceof FieldConfig)) {
    throw new Error("fieldConfig passed to query formatter not of type CollectionFieldConfig.");
  }

  this.conditions = {};
  this.pagination = {};
  this.conditions.search = null;
  this.conditions.query = null;
  this.conditions.mergeQuery = null;
  this.conditions.filters = null;
  this.conditions.range = null;
  this.sort = null;
  this.projection = null;
  this.pagination.limit = 10;
  this.pagination.skip = 0;
  this.pagination.total = 0;
  this.errorMessages = {};

  // Scan , validate and assign for conditions , sort and pagination parameters in input
  for (var searchParameter in inputObj) {
    if (inputObj.hasOwnProperty(searchParameter) && searchParameter !== 'page' && searchParameter !== 'limit') {
      // Check if the input fields are mentioned in the config file
      var fieldObj = fieldConfig.prepare(searchParameter, inputObj[searchParameter]);
      // Save the fieldObj in necessary fields in Grid.query
      // console.log("Field Object returned after preparing --- ", fieldObj);
      if (fieldObj.status === true) {
        switch (searchParameter) {
          case "searchKeyword":
            this.conditions.search = (fieldObj.value.search);
            this.conditions.query = (fieldObj.value.query);
            break;
          case "range":
            this.conditions.range = (fieldObj.value);
            break;
          case "sort":
            this.sort = (fieldObj.value);
            break;
          case "filter":
            this.conditions.filters = (fieldObj.value);
            break;
        }
      }
      // If any error messages push the error messages in Grid.errorMessages
      else if (fieldObj.status === false) {
        // console.log("Error in preparation --- ");
        for (var field in fieldObj.messages) {
          if (fieldObj.messages.hasOwnProperty(field)) {
            if (!this.errorMessages[field]) {
              this.errorMessages[field] = [];
            }
            this.errorMessages[field] = lodash.concat(this.errorMessages[field], (fieldObj.messages[field]));
          }
        }
        // console.log("Error messages ---- ", this.errorMessages);
      }
    }
  }

  //Prepare Pagination Limit
  fieldObj = fieldConfig.prepare("limit", inputObj.limit);
  this.pagination.limit = fieldObj.value.limit;

  //Prepare Pagination Skip
  fieldObj = fieldConfig.prepare("page", inputObj.page);
  this.pagination.skip = fieldObj.value.skip;
  this.pagination.page = fieldObj.value.page;

  //Prepare projection and merge object
  this.projection = fieldConfig.getProjection();
}

/**
 * Renders the Search keyword to MongoDB query format
 * @param {Array} inputSearch
 * @param {Array} inputQuery
 */
Query.prototype.renderSearch = function (inputSearch, inputQuery) {
  var searchArray = [];//Array of query object for search keywords
  if (!lodash.isEmpty(inputSearch)) {
    inputSearch.forEach(function (item, i) {
      var searchQuery = {};
      var key = Object.keys(item)[0];
      searchQuery[key] = new RegExp(inputSearch[i][key], "i");
      searchArray.push(searchQuery);
    });
  }
  this.conditions.search = searchArray;
  searchArray = [];
  if (!lodash.isEmpty(inputQuery)) {
    inputQuery.forEach(function (item, i) {
      var searchQuery = {};
      var key = Object.keys(item)[0];
      searchQuery[key] = new RegExp(inputQuery[i][key], "i");
      searchArray.push(searchQuery);
    });
  }
  this.conditions.query = lodash.concat(this.conditions.mergeQuery || [], searchArray);
};

/**
 * Renders the Filter in the MongoDB query format
 * @param {Array} input used to get filters
 */
Query.prototype.renderFilter = function (input) {
  var filterQuery = {};//query object for filter
  if (!lodash.isEmpty(input)) {
    input.forEach(function (item, i) {
      var key = Object.keys(item)[0];
      filterQuery[key] = {$in: input[i][key]};
    });
  }
  this.conditions.filters = filterQuery;
};


/**
 * Renders the Range in the MongoDB query format
 * @param {Array} input used to get range of values
 */
Query.prototype.renderRange = function (input) {
  var rangeQuery = {};//query object for range
  if (!lodash.isEmpty(input)) {
    input.forEach(function (item, i) {
      var key = Object.keys(item)[0];
      rangeQuery[key] = {$gt: input[i][key][0], $lt: input[i][key][1]};//assign minimum value to $gt and maximum
      // value to $lt
    });
  }
  this.conditions.range = rangeQuery;
};


/**
 * Renders the Search keyword in the MongoDB query format
 * @param {Array} input used to get fields to be sorted
 */
Query.prototype.renderSort = function (input) {
  var sortQuery = {};//query object for sort
  if (!lodash.isEmpty(input)) {
    input.forEach(function (item) {
      var key = Object.keys(item)[0];
      if (item[key].toLowerCase() === 'ascending') {//check if ascending
        sortQuery[key] = 1;
      } else if (item[key].toLowerCase() === 'descending') {// check if descending
        sortQuery[key] = -1;
      }
    });
  }
  this.sort = sortQuery;
};


/**
 * Renders the Projection keyword in the MongoDB query format
 * @param {Array} input used to get fields to be displayed
 */
Query.prototype.renderProjection = function (input) {
  var projectionQuery = {};//query object for projection
  if (!lodash.isEmpty(input)) {
    lodash.keys(input).forEach(function (item) {
      // console.log("Item in projection ---- ", item, input[item]);
      projectionQuery[input[item]] = 1;
    });
  }
  // console.log("ProjectionQuery in queryFormatter ----- ", projectionQuery);
  this.projection = projectionQuery;
};

/**
 * Renders the Pagination keyword in the MongoDB query format
 * @param {Array} input used to get pagination values(skip,limit)
 */
Query.prototype.renderPagination = function (input) {
  this.pagination.limit = input.limit ? input.limit : this.pagination.limit;
  this.pagination.skip = input.skip ? input.skip : this.pagination.skip;
};

module.exports = Query;