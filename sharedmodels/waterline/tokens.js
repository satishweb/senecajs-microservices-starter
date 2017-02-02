'use strict';

module.exports = {
    identity: 'tokens',
    tableName: 'tokens',
    connection: 'default',
    autoPK: false,
    migrate: 'safe',
    attributes: {
        tokenId: { type: 'integer', primaryKey: true, autoIncrement: true },
        email: { type: 'string' },
        tokenValidTillTimestamp: 'string',
        token: 'string'
    }
};