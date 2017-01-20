'use strict';

var lodash = require('lodash');

/**
 * FieldConfig's constructor, checks if collection name exists in configuration and validates the configuration json
 * @throws {Error} In case of invalid collection name or config, throws error
 * @param {String} collectionName The name of the collection
 * @constructor FieldConfig
 */
function FieldConfig(collectionName, collectionConfig, type) {
  if (!collectionConfig) {
    throw new Error("Invalid collection name. '" + collectionName + "' collection does not exist in config.");
  }
  var response = this.validateConfig(collectionConfig);
  if (!response || response.status !== true) {
    throw new Error("Invalid config object. " + response.msg);
  }
  this.configurations = collectionConfig;
  this.projections = {};
  this.paginationLimit = 10;
  this.paginationPage = 1;
}

/**
 * Iterate over the fields of the config and check if all the fields have the correct structure and all search
 * parameters are present
 * @method validateConfig
 * @memberOf FieldConfig
 * @param {Object} config The configuration object corresponding to the collection name. This is to be validated
 * @returns {{status: boolean, message: string}} Status true if valid config file, else status false and message with
 * error
 */
FieldConfig.prototype.validateConfig = function (config) {
  var defaults = {
    "show": true,
    "search": false,
    "filter": false,
    "range": false,
    "sort": false
  };
  if (config === null || !(config instanceof Object)) {
    throw new Error("Invalid type of config object.");
  }
  // iterate over the config
  for (var field in config) {
    if(config.hasOwnProperty(field)) {
      config[field] = lodash.defaultsDeep(config[field], defaults);
      if(!config[field].hasOwnProperty('databaseName')) {
        config[field].databaseName = field;
      }
      if(!config[field].hasOwnProperty('displayName')) {
        config[field].displayName = field;
      }
      if(!config[field].hasOwnProperty('databaseName') ||
        !config[field].hasOwnProperty('displayName') ||
        !config[field].hasOwnProperty('sort') || !config[field].hasOwnProperty('search') ||
        !config[field].hasOwnProperty('filter') || !config[field].hasOwnProperty('range')) {
        return {status: false, message: "Missing field for '" + field + "'."};
      }
    }
  }

  // console.log('override props-- ', config);
  return {status: true, message: ""};
};

/**
 * Prepares the object corresponding to the search parameter
 * @method prepare
 * @memberOf FieldConfig
 * @param {string} searchParameterType Search parameter type eg. search, filter, range, sort, page and limit
 * @param {object} inputObj Contains the part of the input corresponding to the search parameter type
 * @returns {{status: boolean, message: {}, value: {}}} The validated and input field names replaced by database
 * names object
 * @example {"status":true/false, "message":{},"value":{}}
 */
FieldConfig.prototype.prepare = function (searchParameterType, inputObj) {
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

    case "sort":
      return this.prepareSort(inputObj);
      break;

    case "page":
      return this.preparePaginationSkip(inputObj);
      break;

    case "limit":
      return this.preparePaginationLimit(inputObj);
      break;
  }
};


/**
 * Validates and returns status with object
 * @method validate
 * @memberOf  FieldConfig
 * @param searchParameterType
 * @param fieldName
 * @param inputObj
 * @returns Object
 * @example {"status":true/false, "message":""}
 */
FieldConfig.prototype.validate = function (searchParameterType, fieldName, inputObj) {
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
    case "sort":
      return this.validateSort(inputValue, fieldName);
      break;

    case "page":
      return this.validatePaginationPage(inputValue);
      break;

    case "limit":
      return this.validatePaginationLimit(inputValue);
      break;
  }

};

/**
 * Validations related to Search Keyword field
 * Checks if search is allowed on this field
 * @method validateSearch
 * @memberOf FieldConfig
 * @param {object} inputValue The input for this field (currently not used for validations)
 * @param {string} fieldName The name of the field being searched on
 * @returns {{status: boolean, message: {object}, config:{object}}}
 * @example {"status":true/false , "message": {fieldName: ["error messages if any"], "value":{}}
 */
FieldConfig.prototype.validateSearch = function (inputValue, fieldName) {
  var returnObj = {status: false, message: {}};
  // check if input field is searchable according to config
  if (this.configurations[fieldName] && this.configurations[fieldName].search === true) {
    returnObj.status = true;
  } else {  // if input is not allowed to be searched, add error message
    returnObj.message[fieldName] = [];
    returnObj.message[fieldName].push(fieldName + " field is not searchable.");
  }
  return returnObj;
};

/**
 * Validations related to filter field
 * Checks if filtering is allowed on this field
 * @method validateFilter
 * @memberOf FieldConfig
 * @param {object} inputValue The input for this field (currently not used for validations)
 * @param {string} fieldName The name of the field being filtered on
 * @returns {{status: boolean, message: {}, config:{object}}}
 * @example {"status":true/false , "message": {fieldName: ["error messages if any"]}
 */
FieldConfig.prototype.validateFilter = function (inputValue, fieldName) {
  var returnObj = {status: false, message: {}};
  // check if input field is filterable according to config
  if (this.configurations[fieldName] && this.configurations[fieldName].filter === true) {
    returnObj.status = true;
  } else {  // if input is not allowed to be filtered, add error message
    returnObj.message[fieldName] = [];
    returnObj.message[fieldName].push(fieldName + " field is not filterable.");
  }
  return returnObj;
};

/**
 * Validations related to range field
 * Checks if searching by range is allowed for the field and if min and max values are valid
 * @method validateRange
 * @memberOf FieldConfig
 * @param {object} inputValue The input for this field to validate min and max values
 * @param {string} fieldName The name of the field for which range is being applied
 * @returns {{status: boolean, message: {}, config:{object}}}
 * @example {"status":true/false , "message": {fieldName: ["error messages if any"]}
 */
FieldConfig.prototype.validateRange = function (inputValue, fieldName) {
  var returnObj = {status: false, message: {}};
  // check if range can be applied to input field according to config
  if (this.configurations[fieldName] && this.configurations[fieldName].range === true) {
    // check if min value is less than max value
    if (inputValue.min < inputValue.max) {
      returnObj.status = true;
    } else {  // add error message for validation errors
      returnObj.message[fieldName] = [];
      returnObj.message[fieldName] = "Minimum value cannot be greater than the maximum value for " + fieldName;
    }
  } else {  // add error message for validation errors
    returnObj.message[fieldName] = [];
    returnObj.message[fieldName].push(fieldName + " field can not be searched over a range.");
  }
  return returnObj;
};

/**
 * Validations related to sort field
 * Checks if sort is allowed for this field
 * @method validateSort
 * @memberOf FieldConfig
 * @param {object} inputValue The input for this field to check if it's either ascending or descending
 * @param {string} fieldName The name of the field for which sort is being applied
 * @returns {{status: boolean, message: {}}}
 * @example {"status":true/false , "message": {fieldName: ["error messages if any"]}
 */
FieldConfig.prototype.validateSort = function (inputValue, fieldName) {
  var returnObj = {status: false, message: {}};
  // check if range can be applied to input field according to config
  if (this.configurations[fieldName] && this.configurations[fieldName].sort === true) {
    // check if input is correct
    if(inputValue === 'ascending' || inputValue === 'descending'){
      returnObj.status = true;
    } else {  // add error message for validation errors
      returnObj.message[fieldName] = "Input for sort can only be 'ascending' or 'descending' for " + fieldName + " field.";
    }
  } else {  // add error message for validation errors
    returnObj.message[fieldName] = fieldName + " field is not sortable.";
  }
  return returnObj;
};

/**
 * Validations related to limit field
 * Checks if input for the pagination limit is a valid number greater than 0, if it is the input is returned, else
 * value of limit is not returned
 * @method validatePaginationLimit
 * @memberOf FieldConfig
 * @param {object} inputValue The input value of limit
 * @returns {{status: boolean, message: {}, value: {}}}
 * @example {"status":true/false , "message": {limit: ["error messages if any"]}, value: {limit: 12}}
 */
FieldConfig.prototype.validatePaginationLimit = function (inputValue) {
  var returnObj = {status: false, message: {}, value: {}};
  try {
    // convert input limit to integer type
    var limit = parseInt(inputValue, 10);
    // check if input limit is greater than 0
    if (parseInt(inputValue, 10) > 0) {
      returnObj.status = true;
      returnObj.value.limit = limit;
    } else {  // add error message for validation errors
      returnObj.message.limit = "Invalid limit value, limit must be greater than 0.";
    }
  } catch (err) {  // add error message for validation errors
    returnObj.message.limit = "Limit value must be a valid number.";
  }
  return returnObj;
};


/**
 * Validations related to page field
 * Checks if input for the page is a valid number greater than 0
 * @method validatePaginationPage
 * @memberOf FieldConfig
 * @param {object} inputValue The input value of page
 * @returns {{status: boolean, message: {}, value: {}}}
 * @example {"status":true/false , "message": {page: ["error messages if any"]}, value: {page: 4}}
 */
FieldConfig.prototype.validatePaginationPage = function (inputValue) {
  var returnObj = {status: false, message: {}, value: {}};
  try {
    // convert input page to integer type
    var page = parseInt(inputValue, 10);
    // check if input page is greater than 0
    if (parseInt(inputValue, 10) > 0) {
      returnObj.status = true;
      returnObj.value.page = page;
    } else {  // add error message for validation errors
      returnObj.message.page = "Invalid page value, page must be greater than 0.";
    }
  } catch (err) {  // add error message for validation errors
    returnObj.message.page = "Page value must be a valid number.";
  }
  return returnObj;
};


/**
 * Returns the database names of the fields to be shown in the database output
 * @method getProjection
 * @memberOf FieldConfig
 * @returns {Array} Object containing array of database fieldNames and object of field to merge
 * @example {[name, age, lastName, firstName]}
 */
FieldConfig.prototype.getProjection = function () {
  // return the database names of those fields where fields.show=true
  var projectionObject = {};
  // iterate over the config object and create search objects for fields having "search:true"
  for (var field in this.configurations) {
    if (this.configurations.hasOwnProperty(field)) {
      if (this.configurations[field].show === true) {  // check if field is to be shown
        projectionObject[field] = this.configurations[field].databaseName;
      }
    }
  }
  // console.log("Projection in field Config ---- ", projectionObject);
  this.projections = projectionObject;
  return projectionObject;
};

/**
 * Prepares Search Object for all input fields by using the database name from config and their input value
 * If input field name is query, call prepareQuerySearch
 * @method prepareSearch
 * @memberOf FieldConfig
 * @param {object} inputObject The input corresponding to the search keyword parameter type
 * @returns {object} Object with all searchable input fields converted to database names, if query field exists all
 * searchable fields with the query input and appropriate error messages for any non searchable fields in input
 * @example
 * {"status":true/false, "messages":{fieldName:["error messages"]} ,"value":{search:[{"name":["Peter"]}],
 * query:[{email:"Peter"}, {city:"Peter"}]}}
 */
FieldConfig.prototype.prepareSearch = function (inputObject) {
  /*
   * Run a for loop through each fieldName.
   * If fieldName = "query" then create  objects [{databaseName from gridConfig : inputObject.fieldName }]
   * using configurations from this.configurations. Push the new object into returnObj
   * If fieldName <> "query" then check through validateSearch function if search is allowed and then push the new
   * object into returnObj
   */
  var search = {status: true, messages: {}, value: {search:[], query:[]}};
  for (var field in inputObject) {
    if (inputObject.hasOwnProperty(field) && field !== 'query') {
      var validateResponse = this.validateSearch(inputObject[field], field);
      if (validateResponse.status === true) {
        var temp = {};
        if(lodash.isEmpty(validateResponse.config)) {
          temp[this.configurations[field].databaseName] = inputObject[field];
          search.value.search.push(temp);
        }
      } else {
        search.status = false;
        search.messages[field] = (validateResponse.message[field]);
      }
    } else if (inputObject.hasOwnProperty(field)) {
      search.value.query = this.prepareQuerySearch(inputObject);
    }
  }
  return search;
};

/**
 * Iterates through the config and assigns the query input to all searchable fields
 * @method prepareQuerySearch
 * @memberOf FieldConfig
 * @param {Object} inputObject The input value for query
 * @returns {Array} Array of objects containing the database name and the query input
 * @example
 * [{"name":"Peter"}, {"email":"Peter"}]
 */
FieldConfig.prototype.prepareQuerySearch = function (inputObject) {
  // return searchObject
  var searchArray = [];
  // iterate over the config object and create search objects for fields having "search:true"
  for (var field in this.configurations) {
    if (this.configurations.hasOwnProperty(field)) {
      if (this.configurations[field] && this.configurations[field].search === true) { // check if input is correct
        var fieldObj = {};
        fieldObj[this.configurations[field].databaseName] = inputObject.query;
        searchArray.push(fieldObj);
      }
    }
  }
  return searchArray;
};

/**
 * Prepares Filter Object by checking if the input fields are filterable and replacing them with their database names
 * @method prepareFilter
 * @memberOf FieldConfig
 * @param {object} inputObject The input corresponding to the filter parameter type
 * @returns {object} Object containing filterable fields and their inputs and error messages if any input is not valid
 * @example
 * {"status":true/false, "message":"" ,"value":[{"name":["Peter", "Shaw"]}]}
 */
FieldConfig.prototype.prepareFilter = function (inputObject) {
  var filter = {status: true, messages: {}, value: []};
  for (var field in inputObject) {  // iterate over the input object
    if (inputObject.hasOwnProperty(field)) {  // check if input field belongs to the input object or is inherited
      var validateResponse = this.validateFilter(inputObject[field], field);  // check if input is filterable and valid
      // console.log("Validate Response --- ", validateResponse);
      if (validateResponse.status === true) {
        var temp = {};
        temp[this.configurations[field].databaseName] = lodash.concat([], inputObject[field]);
        // console.log("Temporary filter ---- ", temp);
        filter.value.push(temp);
      } else {  // if input is invalid, add error message to output object
        filter.status = false;
        filter.messages[field] = (validateResponse.message[field]);
      }
    }
  }
  return filter;
};


/**
 * Prepares Range Object by checking if the input fields can be applied to range and replacing them with their database
 * names and converting input min-max values to array.
 * @method prepareRange
 * @memberOf FieldConfig
 * @param {object} inputObject The input corresponding to the range parameter type
 * @returns {object} Object containing range fields and their inputs as array and error messages if any input is not
 * valid
 * @example
 * {"status":true/false, "message":"" ,"value":[{"age":[20, 30]}]}
 */
FieldConfig.prototype.prepareRange = function (inputObject) {
  // return RangeObject
  var range = {status: true, messages: {}, value: []};
  for (var field in inputObject) {
    if (inputObject.hasOwnProperty(field)) {
      var validateResponse = this.validateRange(inputObject[field], field);
      if (validateResponse.status === true) {
        var temp = {};
        temp[this.configurations[field].databaseName] = [inputObject[field].min, inputObject[field].max];
        range.value.push(temp);
      } else {
          range.status = false;
          range.messages[field] = (validateResponse.message[field]);
      }
    }
  }
  return range;
};


/**
 * Prepares Sort Object by checking if the input fields can be sorted and replacing them with their database
 * names.
 * @method prepareSort
 * @memberOf FieldConfig
 * @param {object} inputObject The input corresponding to the sort parameter type
 * @returns {object} Object containing sort fields and their inputs and error messages if any input is not valid
 * @example
 * {"status":true/false, "message":"" ,"value":[{"age":'ascending'}]}
 */
FieldConfig.prototype.prepareSort = function (inputObject) {
  // return SortObject
  var sort = {status: true, messages: [], value: []};
  for (var field in inputObject) {
    if (inputObject.hasOwnProperty(field)) {
      var validateResponse = this.validateSort(inputObject[field], field);
      if (validateResponse.status === true) {
        var temp = {};
        temp[this.configurations[field].databaseName] = inputObject[field];
        sort.value.push(temp);
      } else {
        sort.status = false;
        sort.messages.push(validateResponse.message);
      }
    }
  }
  return sort;
};

/**
 * Prepares pagination Object for limit by checking if the input limit is valid, if it is not, the limit is set to
 * default value of 10
 * @method preparePaginationLimit
 * @memberOf FieldConfig
 * @param {object} inputValue The input limit value
 * @returns {{status: boolean, message: {}, value: {}}} The value of limit to be used
 * @example {"status":true/false , "message": {limit: ["error messages if any"]}, value: {limit: 4}}
 */
FieldConfig.prototype.preparePaginationLimit = function (inputValue) {
  // return PaginationLimitObject
  // save the value of the limit  in this.paginationLimit
  var validateResponse = this.validatePaginationLimit(inputValue);
  if (validateResponse.status === true) { //
    this.paginationLimit = inputValue;
  }
  validateResponse['value'].limit = this.paginationLimit;
  return validateResponse;
};

/**
 * Prepares pagination Object for skip by checking if the input page is valid, if it is not, the skip is set to
 * default value of 0, else it is calculated
 * @method preparePaginationSkip
 * @memberOf FieldConfig
 * @param {object} inputValue The input page value
 * @returns {{status: boolean, message: {}, value: {}}} The value of skip to be used
 * @example {"status":true/false , "message": {page: ["error messages if any"]}, value: {skip: 4, page: 1}}
 */
FieldConfig.prototype.preparePaginationSkip = function (inputValue) {
  var validateResponse = this.validatePaginationPage(inputValue); // check if page value is valid
  if (validateResponse.status === true) { // if page value is valid calculate the skip value from it
    this.paginationPage = inputValue;
  }
  validateResponse['value'].page = this.paginationPage;
  validateResponse['value'].skip = (this.paginationPage - 1) * this.paginationLimit; // calculate the skip from this.paginationLimit object
  return validateResponse;
};

module.exports = FieldConfig;