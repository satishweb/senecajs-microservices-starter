'use strict';

var Waterline = require('waterline');

module.exports = function(waterline) {
    // schemas and modules compilation

    /********************************************* Users Waterline Model **************************************/

    var userCollection = Waterline.Collection.extend({
        identity: 'users',
        connection: 'default',
        attributes: {
            email: 'string',
            firstName: 'string',
            lastName: 'string',
            isDeleted: { type: 'boolean'},
            gender: 'string',
            birthDate: 'string',
            contactNumber: 'string',
            address: 'string',
            password: 'string',
            googleId: 'string',
            facebookId: 'string',
            linkedInId: 'string',
            avatar: 'string',
            lastLoggedInTime: { type: 'integer'},
            profileComplete: { type: 'boolean'},
            invitationPending: { type: 'boolean'},
            informedAboutFacebookAuthentication: { type: 'boolean'},
            status: { type: 'string'},
            passwordStatus: { type: 'string'}
        }
    });
    waterline.loadCollection(userCollection);
    
    /*********************************************************** ************************************************/
};