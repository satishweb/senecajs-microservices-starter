'use strict';

var lodash = require('lodash');
var microtime = require('microtime');

function OutputFormatter () {

}

/**
 * Formats the output
 * @returns {Object}  Output format => {
    success  : true,
    message  : {
      id         : 200,
      description: "Data fetched successfully"
    },
    data     : data,
    timestamp: microtime.now(),
    version  : "1.0"
  }
 */
OutputFormatter.prototype.formatOutput = function (input, config, result, pagination, projection) {
  var data = {};
  data.input = input;
  data.configuration = config;
  if (lodash.isEmpty(projection)) {
    data.content = result;
  } else {
    data.content = this.changeDisplayName(result, projection);
  }
  data.pagination = pagination;
  return {
    success  : true,
    message  : {
      id         : 200,
      description: "Data fetched successfully...."
    },
    data     : data,
    timestamp: microtime.now(),
    version  : "1.0"
  };
};

OutputFormatter.prototype.changeDisplayName = function (result, projection) {
  var newResult = [];result.forEach(function (item) {
    newResult.push(lodash.mapValues(projection, function (value, key) {
      return item[value];
    }));});
  return newResult;
};

module.exports = OutputFormatter;