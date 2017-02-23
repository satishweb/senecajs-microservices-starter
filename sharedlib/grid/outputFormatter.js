'use strict';

var lodash = require('lodash');
var microtime = require('microtime');

function OutputFormatter() {

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
OutputFormatter.prototype.formatOutput = function(input, config, result, pagination, projection) {
    var data = {};
    data.input = input;
    data.configuration = config;
    if (lodash.isEmpty(projection)) {
        data.content = result;
    } else {
        data.content = this.changeDisplayName(config, result, projection);
    }
    data.pagination = pagination;
    return {
        success: true,
        message: {
            id: 200,
            description: "Data fetched successfully...."
        },
        data: data,
        timestamp: microtime.now(),
        version: "1.0"
    };
};

OutputFormatter.prototype.changeDisplayName = function(config, result, projection) {
    var newResult = [];
    result.forEach(function(item) {
        item = item.toJSON();
        newResult.push(lodash.mapValues(projection, function(value, key) {
            value = value.replace(/\$/g, '');
            // console.log("value ---- ", value, " key ---- ", key, "item's value ---- ", item[value]);
            if (config[key].join && config[key].join.exclude) {
              config[key].join.exclude.forEach(function (excludedField) {
                // console.log("excluded field ---- ", excludedField);
                if (lodash.isArray(item[value])) {
                  var temp = [];
                  item[value].forEach(function (join) {
                    // console.log("item value for array --- ", join);
                    if (join[excludedField]) {
                      // console.log("excluded field in array object ---", join[excludedField]);
                      delete join[excludedField];
                    }
                    temp.push(join);
                  });
                  item[value] = temp;
                }  
              })
            }
            return item[value];
        }));
    });
    return newResult;
};

module.exports = OutputFormatter;