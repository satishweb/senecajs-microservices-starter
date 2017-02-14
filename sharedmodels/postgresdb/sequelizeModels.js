'use strict';
var Sequelize = require('sequelize');

module.exports = function(sequelize) {

    var User = sequelize.define('users', {
        userId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        email: { type: Sequelize.STRING(255), notNull: true },
        firstName: Sequelize.STRING,
        lastName: Sequelize.STRING,
        isDeleted: Sequelize.BOOLEAN,
        gender: Sequelize.STRING,
        birthDate: Sequelize.DATE,
        contactNumber: Sequelize.STRING,
        address: Sequelize.STRING,
        password: { type: Sequelize.STRING(128), notNull: true },
        googleId: Sequelize.STRING,
        facebookId: Sequelize.STRING,
        linkedInId: Sequelize.STRING,
        avatar: Sequelize.STRING,
        lastLoggedInTime: { type: Sequelize.DATE },
        profileComplete: Sequelize.BOOLEAN,
        passwordStatus: Sequelize.STRING,
        registrationStep: Sequelize.INTEGER,
    });

    var Organization = sequelize.define('organizations', {
        orgId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING },
        subDomain: { type: Sequelize.STRING, unique: true },
        domain: { type: Sequelize.STRING, defaultValue: process.env.DOMAIN },
        fqdn: { type: Sequelize.STRING, unique: true },
        description: { type: Sequelize.STRING },
        website: { type: Sequelize.STRING },
        isDeleted: { type: Sequelize.BOOLEAN, defaultValue: false },
        ownerId: { type: Sequelize.INTEGER }
    });

    var Session = sequelize.define('sessions', {
        sessionId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        JWT: { type: Sequelize.TEXT },
        orgId: { type: Sequelize.STRING },
        firstName: { type: Sequelize.STRING },
        lastName: { type: Sequelize.STRING },
        avatar: { type: Sequelize.STRING },
        userId: { type: Sequelize.STRING },
        emailId: { type: Sequelize.STRING },
        lastLoggedInTime: { type: Sequelize.DATE }
    });

    var Token = sequelize.define('tokens', {
        tokenId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        email: { type: Sequelize.STRING },
        tokenValidTillTimestamp: { type: Sequelize.STRING },
        token: { type: Sequelize.STRING }
    })

    // User.belongsToMany(Organization, { as: 'users', through: 'join_userorgs', foreignKey: 'userId', otherKey: 'orgId' });
    // Organization.belongsToMany(User, { as: 'orgs', through: 'join_userorgs', foreignKey: 'orgId', otherKey: 'userId' });
    // User.hasMany(Organization, { as: 'owner', foreignKey: 'ownerId' });
    // User.hasOne(Session, { foreignKey: 'userId' });

    User.belongsToMany(Organization, { through: 'join_userorgs', foreignKey: 'userId', otherKey: 'orgId' });
    Organization.belongsToMany(User, { through: 'join_userorgs', foreignKey: 'orgId', otherKey: 'userId' });
    User.hasMany(Organization, { as: 'ownedOrgs', foreignKey: 'ownerId' });
    // User.hasOne(Session, { foreignKey: 'userId'})
};