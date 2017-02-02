'use strict';

module.exports = {
    identity: 'organizations',
    tableName: 'organizations',
    connection: 'default',
    autoPK: false,
    migrate: 'safe',
    attributes: {
        orgId: { type: 'integer', primaryKey: true, autoIncrement: true },
        name: 'string',
        subDomain: { type: 'string', unique: true },
        domain: { type: 'string', defaultsTo: process.env.DOMAIN },
        fqdn: 'string',
        description: 'string',
        website: 'string',
        isDeleted: { type: 'boolean', defaultsTo: false },
        ownerId: 'integer'
    }
};