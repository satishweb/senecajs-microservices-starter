'use strict';

var SWAGGER_FILE = __base + '/api/groups.yaml ';
var $RefParser = require('json-schema-ref-parser');
var mongoose = require('mongoose');
var microtime = require('microtime');
var mongoosePaginate = require('mongoose-paginate');
var parser = new $RefParser();

module.exports = function(options) {
    options = options || {};
    var seneca = options.seneca;
    var log = (seneca && seneca.log) || console;

    // loading schema definition from Swagger file
    return parser.bundle(SWAGGER_FILE)
        .then(function(schema) {
            var Group = new mongoose.Schema({
                name: { type: String, default: 'Users', unique: true },
                description: { type: String, default: null },
                organizationId: { type: mongoose.Schema.Types.ObjectId, default: null },
                userIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
                ownerId: { type: mongoose.Schema.Types.ObjectId, default: null }
            });
            Group.set('timestamps', true);
            Group.plugin(mongoosePaginate);
            Group.set('toJSON', {
                transform: function(doc, ret, options) {
                    ret.groupId = ret._id;
                    delete ret._id;
                    delete ret.__v;
                }
            });
            mongoose.model("Groups", Group);
        }).catch(function(error) {
            log.error(options.mdlname, error);
        });
};