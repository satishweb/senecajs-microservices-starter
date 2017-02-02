'use strict';

var Waterline = require('waterline');

module.exports = function(waterline) {
    // schemas and modules compilation

    /********************************* Organizations Waterline Model *********************************/
    
    var OrgCollection = Waterline.Collection.extend({
        identity: 'organizations',
        tableName: 'organizations',
        connection: 'default',
        autoPK: false,
        attributes: {
            orgId      : {type: 'integer', primaryKey: true, autoIncrement: true},
            name       : 'string',
            subDomain  : {type: 'string', unique: true},
            domain     : {type: 'string', defaultsTo: process.env.DOMAIN},
            fqdn       : 'string',
            description: 'string',
            website    : 'string',
            isDeleted  : {type: 'boolean', defaultsTo: false},
            ownerId    : 'integer'
        }
    });
    
    waterline.loadCollection(OrgCollection);
};