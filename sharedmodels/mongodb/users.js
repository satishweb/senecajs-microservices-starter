'use strict';

var mongoose = require('mongoose');
var microtime = require('microtime');

module.exports = function(options) {
    options = options || {};
    var seneca = options.seneca;
    var log = (seneca && seneca.log) || console;
    // schemas and modules compilation

    /********************************************* Users Mongoose Model **************************************/

    var Users = new mongoose.Schema({
        email: { type: String, default: null, unique: true },
        firstName: { type: String, default: null, lowercase: true },
        lastName: { type: String, default: null, lowercase: true },
        isDeleted: { type: Boolean, default: false },
        gender: { type: String, default: null },
        birthDate: { type: String, default: null },
        contactNumber: { type: String, default: null },
        address: { type: String, default: null },
        password: { type: String, default: null },
        googleId: { type: String, default: null },
        facebookId: { type: String, default: null },
        linkedInId: { type: String, default: null },
        avatar: { type: String, default: null },
        lastLoggedInTime: { type: Number, default: null },
        profileComplete: { type: Boolean, default: false },
        invitationPending: { type: Boolean, default: false },
        informedAboutFacebookAuthentication: { type: Boolean, default: false },
        currentOrgId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },
        orgIds: {
            type: [mongoose.Schema.Types.ObjectId],
            default: []
        },
        status: { type: String, default: 'offline' },
        passwordStatus: { type: String, default: "passwordNotSet" },
        groupIds: { type: [mongoose.Schema.Types.ObjectId], default: [] }
    });

    Users.set('timestamps', true);  // add createdAt and updatedAt fields to documents
    Users.set('toJSON', {   // register middleware for schema to transform output
        transform: function(doc, ret, options) {
            ret.userId = ret._id;
            delete ret._id;
            delete ret.__v;
        }
    });
    mongoose.model("Users", Users);

    /*********************************************************** ************************************************/
};