'use strict';

/*
 * this is a POST action for the Email microservice
 * It is used to send emails using nodemailer module
 */
var utils = require(__base + '/sharedlib/utils');
var Locale = require(__base + '/sharedlib/formatter.js');
var outputFormatter = new Locale(__dirname + '/../');
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var nodemailer = require('nodemailer');
/**
 * @module sendEmail
 */

    //Joi validation Schema
    //TODO: MOVE THIS
var validationSchema = Joi.object().keys({
    emailId: Joi.array().items(
        Joi.string().regex(/^\s*[\w\-\+​_]+(\.[\w\-\+_​]+)*\@[\w\-\+​_]+\.[\w\-\+_​]+(\.[\w\-\+_]+)*\s*$/).required()
    ).required(),
    content: Joi.string().trim().required(),
    subject: Joi.string().trim().required()
});

// Create a SMTP transporter object
var transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE, //for SSL set to true and for TLS set to false
    auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD
    }
});


/**
 * Send emails with the same subject and content to multiple recipients.
 * @method sendEmail
 * @param {Object} body: contains the array of email Ids of the recipients, and the subject and content of the mail
 * @returns {Promise} Returns Promise with proper error messages if any.
 */
function sendEmail(body) {
    return new Promise(function(resolve) {
        body.emailId = lodash.uniqBy(body.emailId); // remove any repeated emailIds
        // construct email message
        var message = {
            from: process.env.SMTP_FROM_EMAIL,
            subject: body.subject,
            html: body.content
        };
        body.emailId.forEach(function(email) { // iterate over the array of emailIds to send mail to each
            // Add the recipient to the email object
            message.to = email;

            // send the email
            transporter.sendMail(message, function(error, info) {
                console.log("Info about Sending mail ---- ", error, info);
            });
        });
        resolve();
    });
}

/**
 * Formats the output response and returns the response.
 * @method sendResponse
 * @param done - the done method that returns the response.
 */

var sendResponse = function(success, result, done) {
    if (success) {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(true, 2000, result, 'Email sent successfully')
        });
    } else {
        done(null, {
            statusCode: 200,
            content: outputFormatter.format(false, 1000, null, result)
        });
    }
};
/**
 * This is a sendEmail action for the Email microservice
 */
module.exports = function(options) {
    var seneca = options.seneca;
    return function(args, done) {
        utils.verifyTokenAndDecode(args.header.authorization)
            .then(function (decodedToken){
                if (decodedToken.isMicroservice || (args.header.origin === process.env.HTTPSCHEME + '://' + process.env.APP_URL) ||
                    (process.env.SYSENV !== 'prod' && ((args.header.origin && args.header.origin.match('chrome-extension')) ||
                    (args.header['user-agent'] && args.header['user-agent'].match('PostmanRuntime'))))) {
                    return utils.checkInputParameters(args.body, validationSchema)
                } else {
                    return new Promise(function (resolve, reject) {
                        reject('Host not allowed to send email using this API');
                    })
                }
            })
            .then(function() {
                return sendEmail(args.body);
            })
            .then(function(response) {
                sendResponse(true, response, done);
            })
            .catch(function(error) {
                seneca.log.error('[ ' + process.env.SRV_NAME + ': ' + __filename.split('/').slice(-1) + ' ]', "ERROR" + " : ", error);
                sendResponse(false, error, done);
            });
    };
};