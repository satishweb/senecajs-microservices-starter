'use strict';


// TODO: MOVE COMMON STUFF TO email.js LIB LATER TO AVOID CODE DUPLICATION
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
var mailgun = require('mailgun.js');
var mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_APIKEY });
/**
 * @module sendEmail
 */

//Joi validation Schema
//TODO: MOVE THIS
var validationSchema = Joi.object().keys({
    fromEmailId: Joi.string().regex(/^\s*[\w\-\+​_]+(\.[\w\-\+_​]+)*\@[\w\-\+​_]+\.[\w\-\+_​]+(\.[\w\-\+_]+)*\s*$/).required(),
    content: Joi.string().trim().required(),
    subject: Joi.string().trim().required()
});

// Create a SMTP transporter object
var smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE, //for SSL set to true and for TLS set to false
    auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD
    }
});

function sendMailgunEmail(body) {
    return new Promise(function(resolve, reject) {
        mg.messages.create(process.env.MAILGUN_HOST, {
                from: body.fromEmailId,
                to: process.env.MAIL_DEFAULT_TO,
                subject: body.subject,
                html: body.content
            })
            .then(function(msg) {
                resolve({ message: msg.message });
            }) // logs response data 
            .catch(function(err) {
                reject({ error: err });
            }); // logs any error 
    });
};

/**
 * Send emails with the same subject and content to multiple recipients.
 * @method sendEmail
 * @param {Object} body: contains the array of email Ids of the recipients, and the subject and content of the mail
 * @returns {Promise} Returns Promise with proper error messages if any.
 */
function sendSmtpEmail(body) {
    return new Promise(function(resolve, reject) {
        // construct email message
        var message = {
            from: body.fromEmailId,
            subject: body.subject,
            to: process.env.MAIL_DEFAULT_TO,
            html: body.content
        };
        smtpTransport.sendMail(message, function(error, info) {
            //console.log("Info about Sending mail ---- ", error, info);
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
        //console.log(args.header);
        if ((args.header.origin === process.env.HTTPSCHEME + '://' + process.env.APP_URL) || (args.header.origin === 'http://' + process.env.APP_URL + ':8080') || (process.env !== 'prod' && (args.header.origin && args.header.origin.match('chrome-extension')) || args.header['user-agent'].match('PostmanRuntime'))) {
            utils.checkInputParameters(args.body, validationSchema)
                .then(function() {
                    //var body = JSON.parse(JSON.stringify(args.body));
                    // construct email message
                    switch (process.env.MAIL_DEFAULT_SERVICE) {
                        case 'MAILGUN':
                            return sendMailgunEmail(args.body);
                            break;
                        default:
                            return sendSmtpEmail(args.body);
                    }
                })
                .then(function(response) {
                    return sendResponse(true, response, done);
                })
                .catch(function(error) {
                    console.log(error);
                    seneca.log.error('[ ' + process.env.SRV_NAME + ': ' + __filename.split('/').slice(-1) + ' ]', "ERROR" + " : ", error);
                    sendResponse(false, error, done);
                });
        } else {
            sendResponse(false, 'Host not allowed to send email using this API', done);
        }

    };
};