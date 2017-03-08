'use strict';
var Sequelize = require('sequelize');

module.exports = function(sequelize) {

    var Email = sequelize.define('emails', {
        email: { type: Sequelize.STRING(255), primaryKey: true, notNull: true, unique: true },
    });

    var User = sequelize.define('users', {
        userId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        firstName: Sequelize.STRING,
        lastName: Sequelize.STRING,
        isDeleted: { type: Sequelize.BOOLEAN, defaultValue: false },
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
        profileComplete: { type: Sequelize.BOOLEAN, defaultValue: false },
        passwordStatus: Sequelize.STRING,
        registrationStep: Sequelize.INTEGER,
    });

    var Team = sequelize.define('teams', {
        teamId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING },
        route53Id: { type: Sequelize.STRING },
        route53Status: { type: Sequelize.STRING },
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
        teamId: { type: Sequelize.INTEGER },
        firstName: { type: Sequelize.STRING },
        lastName: { type: Sequelize.STRING },
        avatar: { type: Sequelize.STRING },
        userId: { type: Sequelize.INTEGER },
        emailId: { type: Sequelize.STRING },
        lastLoggedInTime: { type: Sequelize.DATE }
    });

    var Token = sequelize.define('tokens', {
        teamId: { type: Sequelize.INTEGER, primaryKey: true },
        email: { type: Sequelize.STRING, primaryKey: true },
        tokenValidTillTimestamp: { type: Sequelize.STRING },
        token: { type: Sequelize.STRING }
    });

    var Invitation = sequelize.define('invitations', {
        email: { type: Sequelize.STRING, notNull: true },
        firstName: { type: Sequelize.STRING },
        lastName: { type: Sequelize.STRING },
        teamId: { type: Sequelize.INTEGER },
        token: { type: Sequelize.STRING }
    });

    var Group = sequelize.define('groups', {
        groupId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING },
        description: { type: Sequelize.STRING },
        teamId: { type: Sequelize.INTEGER },
        ownerId: { type: Sequelize.INTEGER }
    }, {
        indexes: [{
            unique: true,
            fields: ['name', 'teamId']
        }]
    });

    var Role = sequelize.define('roles', {
        roleId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        teamId: { type: Sequelize.INTEGER },
        name: { type: Sequelize.STRING },
        description: { type: Sequelize.STRING },
        ownerId: { type: Sequelize.INTEGER }
    }, {
        indexes: [{
            unique: true,
            fields: ['name', 'teamId']
        }]
    });

    var Permission = sequelize.define('permissions', {
        permissionId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        resource: { type: Sequelize.STRING },
        permission: { type: Sequelize.STRING },
        description: { type: Sequelize.STRING }
    });

    var ApiKey = sequelize.define('apikeys', {
        apikeyId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        teamId: { type: Sequelize.INTEGER },
        origin: { type: Sequelize.STRING },
        apiKey: { type: Sequelize.STRING }
    });

    // User-Email Mapping 1-Many    
    User.hasMany(Email, { foreignKey: 'userId' });

    // User-Team Mapping Many-Many
    User.belongsToMany(Team, { through: 'join_userteams', foreignKey: 'userId', otherKey: 'teamId' });
    Team.belongsToMany(User, { through: 'join_userteams', foreignKey: 'teamId', otherKey: 'userId' });
    
    // User-Group Mapping Many-Many
    User.belongsToMany(Group, { through: 'join_usergroups', foreignKey: 'userId', otherKey: 'groupId' });
    Group.belongsToMany(User, { through: 'join_usergroups', foreignKey: 'groupId', otherKey: 'userId' });
    
    // Team-Owner Mapping Many-1
    User.hasMany(Team, { as: 'ownedTeams', foreignKey: 'ownerId' });
    Team.belongsTo(User, { as: 'owner', foreignKey: 'ownerId' });
    
    // Group-Owner Mapping Many-1 
    User.hasMany(Group, { as: 'ownedGroups', foreignKey: 'ownerId' });
    Group.belongsTo(User, { as: 'owner', foreignKey: 'ownerId' });
    
    // Team-Group Mapping 1-Many
    Team.hasMany(Group, { foreignKey: 'teamId' });
    Group.belongsTo(Team, { foreignKey: 'teamId' });
    
    // Team-ApiKey Mapping 1-Many
    Team.hasMany(ApiKey, { foreignKey: 'teamId' });
    ApiKey.belongsTo(Team, { foreignKey: 'teamId' });

    // Role-Owner Mapping Many-1
    User.hasMany(Role, { as: 'ownedRoles', foreignKey: 'ownerId' });
    Role.belongsTo(User, { as: 'owner', foreignKey: 'ownerId' });

    // Role-Team Mapping Many-1
    Team.hasMany(Role, { foreignKey: 'teamId' });
    Role.belongsTo(Team, { foreignKey: 'teamId' });

    // Role-User Mapping Many-Many
    User.belongsToMany(Role, { through: 'join_userroles', foreignKey: 'userId', otherKey: 'roleId' });
    Role.belongsToMany(User, { through: 'join_userroles', foreignKey: 'roleId', otherKey: 'userId' });
    
    // Role-Group Mapping Many-Many
    Role.belongsToMany(Group, { through: 'join_grouproles', foreignKey: 'roleId', otherKey: 'groupId' });
    Group.belongsToMany(Role, { through: 'join_grouproles', foreignKey: 'groupId', otherKey: 'roleId' });
    
    // Role-Permission Mapping Many-Many
    Role.belongsToMany(Permission, { through: 'join_rolepermissions', foreignKey: 'roleId', otherKey: 'permissionId' });
    Permission.belongsToMany(Role, { through: 'join_rolepermissions', foreignKey: 'permissionId', otherKey: 'roleId' });
    
};