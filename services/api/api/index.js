'use strict';

var fs = require('fs');
var path = require('path');

module.exports = function(options, done) {
    var server = options.server;
    var seneca = options.seneca;
    var plugins = [];
    /**
     * Loads the API definitions and stores them in an array
     * @param {String} dir The name of the directory to be read
     */
    function loadFiles(dir) {
        // read all files in the directory and register the APIs with the server
        fs.readdirSync(dir).forEach(function(file) { // iterate over all .js files
            var f = path.basename(file, '.js'); // remove the file extension

            // if the file is a directory, call the function recursively passing file as the directory
            if (fs.statSync(dir + '/' + file).isDirectory()) {
                loadFiles(path.join(dir, '/', file));
            }
            if (f !== file && f !== 'index') { // if the filename is not index, register the file with the server
                seneca.log.info('[ ' + process.env.SRV_NAME + ' ]', 'Loading API: ', f);
                var plugin = require(path.join(dir, '/', file));
                plugin.attributes = {
                    name: process.env.SRV_NAME + f,
                    version: '1.0.0'
                };
                // add the required file to the array to be registered with server
                plugins.push({
                    register: plugin,
                    options: options
                });
            }
        });
    }
    loadFiles(__dirname);
    server.register(plugins, done);
};
