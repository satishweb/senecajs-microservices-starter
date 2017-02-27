'use strict';

var lodash = require('lodash');
var Promise = require('bluebird');

/**
 * @method fetchGeneralGroup
 * @param {Object} Group mongoose schema object
 * @param {String} teamId team Id
 * @returns {Promise} Promise containing Group details, else containing the error message
 */
module.exports.fetchGeneralGroup = function fetchGeneralGroup(Group, teamId) {
  return new Promise(function (resolve, reject) {
    Group = mongoose.model('DynamicGroup', Group.schema, teamId + '_groups');
    Group.findOne({name: 'general'}, function (err, findResponse) {
      if (err) {
        reject({id: 400, msg: err});
      } else {
        if (!lodash.isEmpty(findResponse)) {
          findResponse = JSON.parse(JSON.stringify(findResponse));
          resolve(findResponse.groupId);
        } else {
          resolve(null);
        }
      }
    })
  });
};