'use strict';

module.exports = {
        identity: 'sessions',
        tableName: 'sessions',
        connection: 'default',
        autoPK: false,
        attributes: {
            sessionId       : {type: 'integer', primaryKey: true, autoIncrement: true},
            JWT             : {type: 'string'},
            orgId           : {type: 'string'},
            firstName       : {type: 'string'},
            lastName        : {type: 'string'},
            avatar          : {type: 'string'},
            userId          : {type: 'string'},
            emailId         : {type: 'string'},
            lastLoggedInTime: {type: 'string'}
        }
    };