'use strict';

var mongoose = require('mongoose');

module.exports = function(options) {

    options = options || {};
    var seneca = options.seneca;
    var log = (seneca && seneca.log) || console;

    var Organizations = new mongoose.Schema({
        name: { type: String, default: null },
        subDomain: { type: String, default: null, unique: true },
        domain: { type: String, default: process.env.DOMAIN },
        fqdn: { type: String, default: null },
        description: { type: String, default: null },
        website: { type: String, default: null },
        isDeleted: { type: Boolean, default: false },
        ownerId: { type: mongoose.Schema.Types.ObjectId, default: null }
    });
    Organizations.set('timestamps', true);
    Organizations.set('toJSON', {
        transform: function(doc, ret, options) {
            ret.orgId = ret._id;
            delete ret._id;
            delete ret.__v;
        }
    });
    mongoose.model("Organizations", Organizations);
};