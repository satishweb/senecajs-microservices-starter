'use strict';

var Waterline = require('waterline');

module.exports = function(waterline) {
    // schemas and modules compilation

    /********************************************* Users Waterline Model **************************************/

    var userCollection = Waterline.Collection.extend({
        identity: 'users',
        tableName: 'users',
        connection: 'default',
        autoPK: false,
        attributes: {
            userId: {type:'integer', primaryKey: true},
            email: {type: 'string'},
            firstName: 'string',
            lastName: 'string',
            isDeleted: 'boolean',
            gender: 'string',
            birthDate: 'string',
            contactNumber: 'string',
            address: 'string',
            password: 'string',
            googleId: 'string',
            facebookId: 'string',
            linkedInId: 'string',
            avatar: 'string',
            lastLoggedInTime: 'string',
            profileComplete: 'boolean',
            passwordStatus: 'string',
            orgId: 'integer'
        }
    });
    waterline.loadCollection(userCollection);
    
    /*********************************************************** ************************************************/
};