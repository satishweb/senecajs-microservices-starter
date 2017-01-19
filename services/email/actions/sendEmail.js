'use strict';

/*
 * this is a POST action for the Email microservice
 * It is used to send emails using nodemailer module
 */
var utils = require(__base + '/sharedlib/utils');
var authentication = require(__base + '/sharedlib/authentication');
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
        var sent = []; // array to store the responses of each mail
        body = JSON.parse(JSON.stringify(body));
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
                // console.log("Info about Sending mail ---- ", error, info);
                if (info && info.accepted && info.accepted[0]) {
                    sent.push(info.accepted[0]); // add the response returned to sent array
                }
            });
        });
        resolve(true);
    });
}

/**
 * Formats the output response and returns the response.
 * @method sendResponse
 * @param done - the done method that returns the response.
 */
function sendResponse(done) {
    done(null, {
        statusCode: 200,
        content: outputFormatter.format(true, 2090, null, "Emails")
    });
}

/**
 * This is a sendEmail action for the Email microservice
 */
module.exports = function(options) {
    var seneca = options.seneca;
    return function(args, done) {
        // console.log("----------- Send mail called -------------");
        authentication.checkInputParameters(args.body, validationSchema)
            .then(function() {
                var body = JSON.parse(JSON.stringify(args.body));
                return sendEmail(body);
            })
            .then(function() {
                return sendResponse(done);
            })
            .catch(function(error) {
                seneca.log.error('[ ' + process.env.SRV_NAME + ': ' + __filename.split('/').slice(-1) + ' ]', "ERROR" +
                  " : ", err);
                done(null, {
                    statusCode: 200,
                    content: error.success === true || error.success === false ? error : utils.error(error.id || 400, error.msg || "Unexpected error", microtime.now())
                });
            });
    };
};