'use strict';

var SWAGGER_FILE = __base + '/api/organizations.yaml';

var $RefParser = require('json-schema-ref-parser');
var mongoose = require('mongoose');
var mongoosePaginate = require('mongoose-paginate');
var parser = new $RefParser();

module.exports = function(options) {

    options = options || {};
    var seneca = options.seneca;
    var log = (seneca && seneca.log) || console;

    // // loading schema definition from Swagger file
    return parser.bundle(SWAGGER_FILE)
        .then(function() {
            // schemas and modules compilation
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
            Organizations.plugin(mongoosePaginate);
            Organizations.set('toJSON', {
                transform: function(doc, ret, options) {
                    ret.orgId = ret._id;
                    delete ret._id;
                    delete ret.__v;
                }
            });
            mongoose.model("Organizations", Organizations);
        }).catch(function(error) {
            log.error(options.mdlname, error);
        });
};