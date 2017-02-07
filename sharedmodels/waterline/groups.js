'use strict';

module.exports = {
    identity: 'groups',
    tableName: 'groups',
    connection: 'default',
    autoPK: false,
    migrate: 'safe',
    attributes: {
        groupId: { type: 'integer', primaryKey: true, autoIncrement: true },
        name: { type: 'string', defaultsTo: 'users', unique: true, required: true},
        description: 'string',
        orgId: 'integer',
        ownerId: {
            model: 'users'
        },
        userIds: {
            collection: 'users',
            via: 'groupIds'
        } 
    }
}