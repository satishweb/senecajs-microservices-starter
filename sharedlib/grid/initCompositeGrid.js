'use strict';

var CompositeGrid = require("./compositeGrid.js");
var fs = require('fs');

module.exports.initFromConfigObject = function (inputObj, apiName, database, seneca, config){
  return new CompositeGrid(inputObj, config, apiName, database, seneca);
};

module.exports.initFromConfigFile= function (inputObj, apiName, database, seneca, config){
  if(!config){
    config = __dirname + '/config.json';
  }
  config = JSON.parse(fs.readFileSync(config));
  return new CompositeGrid(inputObj, config, apiName, database, seneca);
};