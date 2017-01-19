'use strict';

var mongoose = require('mongoose');

module.exports = function(options) {
    options = options || {};
    var seneca = options.seneca;
    var log = (seneca && seneca.log) || console;
    // schemas and modules compilation
    var Token = new mongoose.Schema({
        email: { type: String, default: null },
        token: { type: String, default: null },
        tokenValidTillTimestamp: { type: String, default: null }
    });

    Token.set('timestamps', true);
    Token.set('toJSON', {
        transform: function(doc, ret, options) {
            ret.tokenId = ret._id;
            delete ret._id;
            delete ret.__v;
        }
    });
    mongoose.model("Tokens", Token);
};