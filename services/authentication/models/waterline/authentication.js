'use strict';

var Waterline = require('waterline');

module.exports = function(waterline) {
    // schemas and modules compilation

    /********************************************* Token Waterline Model **************************************/

    var tokenCollection = Waterline.Collection.extend({
        identity: 'tokens',
        tableName: 'tokens',
        connection: 'default',
        autoPK: false,
        attributes: {
            tokenId: {type:'integer', primaryKey: true},
            email: {type: 'string'},
            tokenValidTillTimestamp: 'string',
            token: 'string'
        }
    });
    waterline.loadCollection(tokenCollection);
    
    /*********************************************************** ************************************************/
};