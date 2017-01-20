'use strict';

var Localize = require('localize');
var lodash = require('lodash');
var microtime = require('microtime');


/**
 * Function : This class will render messages/string according to the code and the arguments given as input.
 *            This requires the messages to be defined in translations.js
 * @class OutputFormatter
 * @param {String} filePath path of the file translations.json which contains all the messages templates. By default
 * this will be the current directory where emailFormatter.js is located
 * @param {String} locale Code denoting the language . Default value ='en' i.e. English  
 */
var outputFormatter = function(filePath, locale) {
    //Assign default values to input parameters
    filePath = filePath || __dirname;
    locale = locale || 'en'; // set language to be used for translations
    try {
        this.localize = new Localize(filePath, null, 'dummy'); //create instance of Localize object
    } catch (err) {
        console.log('Translations file not found: ', err);
    }
    this.localize.setLocale(locale); // set language
};

/**
 * Formats the message according to the locale settings and the arguments received in input 
 *   @memberof OutputFormatter.prototype
 *   @method format
 *   @param {boolean} success Suggests whether the message/response is a success or error message.  
 *   @param {Number} code Code for the message to be formatted. These codes are entered in translations.json.
 *   @param {Object} data The output of the API. 
 *   @param {String} args Can have multiple arguments i.e. arg1, arg2, arg3 ... .
 *          These are the  dynamic values that will be placed in the message template defined in translations.json.
 *   @returns {Object} Object containing the formatted message.
 */
outputFormatter.prototype.format = function(success, code, data, args) {
    var newArr = [code];
    //Take all the arguments of this function except for success, code and data 
    var temp = Array.prototype.splice.call(arguments, 3, arguments.length - 1);
    newArr = lodash.concat(newArr, temp);
    // TODO: Replace hardcoded version by version in input
    var response = {
        "success": success,
        "message": {
            "id": code,
            "description": this.localize.translate.apply(null, newArr) //Gives message according to the code and arguments passed
        },
        "timestamp": microtime.now(),
        "version": "1.0"
    };
    if (data) {
        response['data'] = data;
    }
    return response;
};

/**
 * Format content for emails
 * @memberof OutputFormatter.prototype
 * @method email
 * @param {Number} code Code for the message to be formatted. These codes are entered in translations.json
 * @param {String} args Can have multiple arguments i.e. arg1, arg2, arg3 ... .
 *          These are the  dynamic values that will be placed in the message template defined in translations.json.
 * @returns {String} Returns the formatted message 
 */
outputFormatter.prototype.email = function(code, args) {
    return this.localize.translate.apply(null, arguments);
};

module.exports = outputFormatter;