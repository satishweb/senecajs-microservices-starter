'use strict';

module.exports = {
    identity: 'users',
    tableName: 'users',
    connection: 'default',
    autoPK: false,
    migrate: 'safe',
    attributes: {
        userId: { type: 'integer', primaryKey: true, autoIncrement: true },
        email: { type: 'string' },
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
    /*,
            updateOrCreate: function(find, update) {
                return users.update(find, update)
                    .then(function(updatedResult) {
                        if (updatedResult.length === 0) {
                            // No records updated, User does not exist. Create.
                            update = lodash.assign(find, update);
                            return users.create(update);
                        }
                    });
            }*/
};