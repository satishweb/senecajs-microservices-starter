'use strict';

var lodash = require('lodash');
var FieldConfig = require("./apiFieldConfig.js");

/**
 * Initialise Query object to default properties
 * @constructor
 */
function ApiCallFormatter(fieldConfig, inputObj) {

  if (!(fieldConfig instanceof FieldConfig)) {
    throw new Error("fieldConfig passed to query formatter not of type ApiFieldConfig.");
  }
  this.fieldConfig = fieldConfig;
  this.apiBody = {};
  this.input = inputObj;
}

/**
* Renders the Search keyword to MongoDB query format
*/
ApiCallFormatter.prototype.renderApiCall = function () {
  console.log("Input ----- ", this.input);
  for (var searchParameter in this.input) {
    console.log("Search parameter ---- ", searchParameter);
    if (this.input.hasOwnProperty(searchParameter) && searchParameter !== 'page' && searchParameter !== 'limit' &&
      searchParameter !== 'sort') {
      // Check if the input fields are mentioned in the config file
      var response = this.fieldConfig.prepare(searchParameter, this.input[searchParameter]).value;
      if (!lodash.isEmpty(response)) {
        this.apiBody[searchParameter] = response;
      }
    }
  }
  console.log("API body ----- ", this.apiBody);
  return this.apiBody;
};
/*
/!**
 * Renders the Search keyword to MongoDB query format
 * @param {Object} input
 *!/
ApiCallFormatter.prototype.renderSearch = function (input) {
  if (!lodash.isEmpty(input)) {
    this.apiBody.searchKeyword = input;
  }
};

/!**
 * Renders the Filter in the MongoDB query format
 * @param {Object} input used to get filters
 *!/
ApiCallFormatter.prototype.renderFilter = function (input) {
  if (!lodash.isEmpty(input)) {
    this.apiBody.filter = input;
  }
};


/!**
 * Renders the Range in the MongoDB query format
 * @param {Object} input used to get range of values
 *!/
ApiCallFormatter.prototype.renderRange = function (input) {
  if (!lodash.isEmpty(input)) {
    this.apiBody.range = input;
  }
};*/

module.exports = ApiCallFormatter;