'use strict';
    
module.exports = {
    identity: 'invitations',
    tableName: 'invitations',
    connection: 'default',
    autoPK: false,
    migrate: 'safe',
    attributes: {
        email: { type: 'string', default: null, unique: true },
        firstName: 'string',
        lastName: 'string',
        orgId: 'number',
        token: 'string'
    }
};