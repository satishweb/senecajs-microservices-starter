'use strict';

var mongoose = require('mongoose');

module.exports = function(options) {
    options = options || {};
    var seneca = options.seneca;
    var log = (seneca && seneca.log) || console;
    
    // schemas and modules compilation
    var Invitation = new mongoose.Schema({
        email: { type: String, default: null, unique: true },
        firstName: { type: String, default: null },
        lastName: { type: String, default: null },
        orgId: { type: String, default: null },
        token: { type: String, default: null }
    });
    Invitation.set('timestamps', true);
    mongoose.model("Invitations", Invitation);
        
};