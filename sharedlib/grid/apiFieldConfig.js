'use strict';

var lodash = require('lodash');
var Promise = require('bluebird');
// var searchConfigs = require('./config.json');
var jwt = require('jsonwebtoken');
var Joi = require('joi');

/**
 * ApiFieldConfig's constructor, checks if collection name exists in configuration and validates the configuration json
 * @throws {Error} In case of invalid collection name or config, throws error
 * @param {String} collectionName The name of the collection
 * @constructor ApiFieldConfig
 */
function ApiFieldConfig(apiConfig) {
  if (lodash.isEmpty(apiConfig)) {
    throw new Error("Invalid configuration.");
  }
  this.validateConfig(apiConfig);
  this.configurations = apiConfig;
}

/**
 * Iterate over the fields of the config and check if all the fields have the correct structure and all search
 * parameters are present
 * @method validateConfig
 * @memberOf ApiFieldConfig
 * @param {Object} config The configuration object corresponding to the collection name. This is to be validated
 */
ApiFieldConfig.prototype.validateConfig = function (config) {
  // iterate over the config
  console.log("Config in apiFieldConfig --- ", config);
  var apiConfigSchema = Joi.object().keys({
    apiCall        : Joi.object().keys({
      role: Joi.string().required(),
      cmd : Joi.string().required()
    }).required(),
    foreignKey     : Joi.string().required(),
    primaryKey     : Joi.string().required(),
    inputParameters: Joi.object()
  });
  Joi.validate(config, apiConfigSchema, function (err) {
    if (err) {
      console.log('err--- ', err);
      throw new Error("Invalid apiConfig, " + err.details[0].message);
    }
  });
};

/**
 *
 * @param input
 */
ApiFieldConfig.prototype.validateInputs = function (input) {
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
 * Prepares the object corresponding to the search parameter
 * @method prepare
 * @memberOf ApiFieldConfig
 * @param {string} searchParameterType Search parameter type eg. search, filter, range, sort, page and limit
 * @param {object} inputObj Contains the part of the input corresponding to the search parameter type
 * @returns {{status: boolean, message: {}, value: {}}} The validated and input field names replaced by database
 * names object
 * @example {"status":true/false, "message":{},"value":{}}
 */
ApiFieldConfig.prototype.prepare = function (searchParameterType, inputObj) {
  switch (searchParameterType) {
    case "searchKeyword":
      return this.prepareSearch(inputObj);
      break;

    case "filter":
      return this.prepareFilter(inputObj);
      break;

    case "range":
      return this.prepareRange(inputObj);
      break;
  }
};

/**
 * Validates and returns status with object
 * @method validate
 * @memberOf  ApiFieldConfig
 * @param searchParameterType
 * @param fieldName
 * @param inputObj
 * @returns Object
 * @example {"status":true/false, "message":""}
 */
ApiFieldConfig.prototype.validate = function (searchParameterType, fieldName, inputObj) {
  var inputValue = inputObj[fieldName];
  switch (searchParameterType) {
    case "searchKeyword":
      return this.validateSearch(inputValue, fieldName);
      break;

    case "filter":
      return this.validateFilter(inputValue, fieldName);
      break;

    case "range":
      return this.validateRange(inputValue, fieldName);
      break;
  }

};

/**
 * Validations related to Search Keyword field
 * Checks if search is allowed on this field
 * @method validateSearch
 * @memberOf ApiFieldConfig
 * @param {object} inputValue The input for this field (currently not used for validations)
 * @param {string} fieldName The name of the field being searched on
 * @returns {{status: boolean, message: {object}}}
 * @example {"status":true/false , "message": {fieldName: ["error messages if any"]}}
 */
ApiFieldConfig.prototype.validateSearch = function (inputValue, fieldName) {
  var returnObj = {status: false, message: {}};
  if (this.configurations.inputParameters[fieldName]) {
    returnObj.status = true;
  }
  return returnObj;
};

/**
 * Validations related to filter field
 * Checks if filtering is allowed on this field
 * @method validateFilter
 * @memberOf ApiFieldConfig
 * @param {object} inputValue The input for this field (currently not used for validations)
 * @param {string} fieldName The name of the field being filtered on
 * @returns {{status: boolean, message: {}}}
 * @example {"status":true/false , "message": {fieldName: ["error messages if any"]}}
 */
ApiFieldConfig.prototype.validateFilter = function (inputValue, fieldName) {
  var returnObj = {status: false, message: {}};
  if (this.configurations.inputParameters[fieldName]) {
    returnObj.status = true;
  }
  return returnObj;
};

/**
 * Validations related to range field
 * Checks if searching by range is allowed for the field and if min and max values are valid
 * @method validateRange
 * @memberOf ApiFieldConfig
 * @param {object} inputValue The input for this field to validate min and max values
 * @param {string} fieldName The name of the field for which range is being applied
 * @returns {{status: boolean, message: {}}}
 * @example {"status":true/false , "message": {fieldName: ["error messages if any"]}}
 */
ApiFieldConfig.prototype.validateRange = function (inputValue, fieldName) {
  var returnObj = {status: false, message: {}};
  if (this.configurations.inputParameters[fieldName]) {
    returnObj.status = true;
  }
  return returnObj;
};

/**
 * Prepares Search Object for all input fields by using the database name from config and their input value
 * If input field name is query, call prepareQuerySearch
 * @method prepareSearch
 * @memberOf ApiFieldConfig
 * @param {object} inputObject The input corresponding to the search keyword parameter type
 * @returns {object} Object with all searchable input fields converted to database names, if query field exists all
 * searchable fields with the query input and appropriate error messages for any non searchable fields in input
 * @example
 * {"status":true/false, "messages":{fieldName:["error messages"]} ,"value":{search:[{"name":["Peter"]}],
 * query:[{email:"Peter"}, {city:"Peter"}]}}
 */
ApiFieldConfig.prototype.prepareSearch = function (inputObject) {
  var search = {status: true, messages: {}, value: {}};
  for (var field in inputObject) {
    if (inputObject.hasOwnProperty(field)) {
      if (field !== 'query') {
        var validateResponse = this.validateSearch(inputObject[field], field);
        if (validateResponse.status === true) {
          search.value[this.configurations.inputParameters[field]] = inputObject[field];
        } /*else {
          search.status = false;
          search.messages[field] = (validateResponse.message[field]);
        }*/
      } else {
        search.value.query = inputObject[field];
      }
    }
  }
  return search;
};

/**
 * Prepares Filter Object by checking if the input fields are filterable and replacing them with their database names
 * @method prepareFilter
 * @memberOf ApiFieldConfig
 * @param {object} inputObject The input corresponding to the filter parameter type
 * @returns {object} Object containing filterable fields and their inputs and error messages if any input is not valid
 * @example
 * {"status":true/false, "message":"" ,"value":[{"name":["Peter", "Shaw"]}]}
 */
ApiFieldConfig.prototype.prepareFilter = function (inputObject) {
  var filter = {status: true, messages: {}, value: {}};
  for (var field in inputObject) {
    if (inputObject.hasOwnProperty(field)) {
      var validateResponse = this.validateFilter(inputObject[field], field);
      if (validateResponse.status === true) {
        filter.value[this.configurations.inputParameters[field]] = inputObject[field];
      } /*else {
        filter.status = false;
        filter.messages[field] = (validateResponse.message[field]);
      }*/
    }
  }
  return filter;
};


/**
 * Prepares Range Object by checking if the input fields can be applied to range and replacing them with their database
 * names and converting input min-max values to array.
 * @method prepareRange
 * @memberOf ApiFieldConfig
 * @param {object} inputObject The input corresponding to the range parameter type
 * @returns {object} Object containing range fields and their inputs as array and error messages if any input is not
 * valid
 * @example
 * {"status":true/false, "message":"" ,"value":[{"age":[20, 30]}]}
 */
ApiFieldConfig.prototype.prepareRange = function (inputObject) {
  // return RangeObject
  var range = {status: true, messages: {}, value: {}};
  for (var field in inputObject) {
    if (inputObject.hasOwnProperty(field) && field !== 'query') {
      var validateResponse = this.validateRange(inputObject[field], field);
      if (validateResponse.status === true) {
        range.value[this.configurations.inputParameters[field]] = inputObject[field];
      } /*else {
        range.status = false;
        range.messages[field] = (validateResponse.message[field]);
      }*/
    }
  }
  return range;
};

ApiFieldConfig.prototype.prepareApiCall = function () {
  return lodash.cloneDeep(this.configurations.apiCall);
};

module.exports = ApiFieldConfig;