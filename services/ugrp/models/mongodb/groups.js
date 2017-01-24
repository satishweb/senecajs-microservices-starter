'use strict';

var mongoose = require('mongoose');
var microtime = require('microtime');

module.exports = function(options) {
    options = options || {};
    var seneca = options.seneca;
    var log = (seneca && seneca.log) || console;

    // loading schema definition from Swagger file
    var Group = new mongoose.Schema({
        name: { type: String, default: 'users', unique: true },
        description: { type: String, default: null },
        organizationId: { type: mongoose.Schema.Types.ObjectId, default: null },
        userIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
        ownerId: { type: mongoose.Schema.Types.ObjectId, default: null }
    });
    Group.set('timestamps', true);
    Group.set('toJSON', {
        transform: function(doc, ret, options) {
            ret.groupId = ret._id;
            delete ret._id;
            delete ret.__v;
        }
    });
    mongoose.model("Groups", Group);

};