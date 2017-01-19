'use strict';

var SWAGGER_FILE = __base + '/api/invitations.yaml';

var $RefParser = require('json-schema-ref-parser');
var mongoose = require('mongoose');
var parser = new $RefParser();

module.exports = function(options) {
    options = options || {};
    var seneca = options.seneca;
    var log = (seneca && seneca.log) || console;

    // loading schema definition from Swagger file
    return parser.bundle(SWAGGER_FILE)
        .then(function() {
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
        }).catch(function(error) {
            log.error(options.mdlname, error);
        });
};