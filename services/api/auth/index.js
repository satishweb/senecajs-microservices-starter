'use strict';

var fs = require('fs');
var path = require('path');

module.exports = function(options) {
    var server = options.server;
    var seneca = options.seneca;
    /**
     * Loads the auth schemas and registers them with Hapi's auth middleware
     * @param {String} dir The name of the directory to be read
     */
    function loadFiles(dir) {
        fs.readdirSync(dir).forEach(function(file) { // iterate over all .js files
            var f = path.basename(file, '.js'); // remove the file extension

            // if the file is a directory, call the function recursively passing file as the directory
            if (fs.statSync(dir + '/' + file).isDirectory()) {
                loadFiles(path.join(dir, '/', file));
            }
            if (f !== file && f !== 'index') { // if the filename is not index, register the file with the server
                seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'Loading Auth Mechanism:: ' + f);
                var plugin = require(path.join(dir, '/', file)); // load the auth scheme
                server.auth.scheme(f, plugin.schema); // register plugin by creating schema of filename
                server.auth.strategy(f, f, options); // create an instance of the scheme
            }
        });
    }
    loadFiles(__dirname);
};
