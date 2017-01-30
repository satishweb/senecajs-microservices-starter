var Sequelize = require('sequelize');

module.exports = function(sequelize) {

    /********************************************* Users Postgres Model **************************************/

    return sequelize.define('user', {
        userId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        email: { type: Sequelize.STRING, unique: true },
        firstName: { type: Sequelize.STRING, default: null},
        lastName: { type: Sequelize.STRING, default: null},
        isDeleted: { type: Sequelize.BOOLEAN, default: false },
        gender: { type: Sequelize.STRING, default: null },
        birthDate: { type: Sequelize.DATE, default: null },
        contactNumber: { type: Sequelize.STRING, default: null },
        address: { type: Sequelize.STRING, default: null },
        password: { type: Sequelize.STRING, default: null },
        googleId: { type: Sequelize.STRING, default: null },
        facebookId: { type: Sequelize.STRING, default: null },
        linkedInId: { type: Sequelize.STRING, default: null },
        avatar: { type: Sequelize.STRING, default: null },
        lastLoggedInTime: { type: Sequelize.DATE, default: null },
        profileComplete: { type: Sequelize.BOOLEAN, default: false },
        invitationPending: { type: Sequelize.BOOLEAN, default: false },
        informedAboutFacebookAuthentication: { type: Sequelize.BOOLEAN, default: false },
        orgIds: {type: Sequelize.ARRAY(Sequelize.RANGE(Sequelize.INTEGER))},
        status: { type: Sequelize.STRING, default: 'offline' },
        passwordStatus: { type: Sequelize.STRING, default: "passwordNotSet" },
        groupIds: {type: Sequelize.ARRAY(Sequelize.RANGE(Sequelize.INTEGER))}
    });

    /*********************************************************** ************************************************/
};
