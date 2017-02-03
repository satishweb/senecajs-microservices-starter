'use strict';

var nodemailer = require('nodemailer');
var Locale = require(__base + '/sharedlib/formatter');
var outputFormatter = new Locale(__dirname + '/../');
var mailgun = require('mailgun.js');
var mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_APIKEY });

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

/**
 * Send contact form from user using SMTP.
 * @method sendSmtpContactForm
 * @param {Object} body Contains the email Id of the user and the subject and content of the mail
 * @returns {Promise} Returns Promise with proper error messages if any.
 */
module.exports.sendSmtpContactForm = function(body) {
    return new Promise(function(resolve, reject) {
        // construct email message
        var message = {
            to: process.env.MAIL_DEFAULT_TO,
            from: body.fromEmailId,
            subject: body.subject,
            html: body.content
        };

        // send the email
        smtpTransport.sendMail(message, function(error, info) {
            console.log("Info about SMTP send ---- ", error, info);
        });
        resolve();
    });
};

/**
 * Send emails with the same subject and content to multiple recipients using SMTP.
 * @method sendSmtpEmails
 * @param {Object} body Contains the array of email Ids of the recipients, and the subject and content of the mail
 * @returns {Promise} Returns Promise with proper error messages if any.
 */
module.exports.sendSmtpEmails = function(body) {
    return new Promise(function(resolve, reject) {
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
            smtpTransport.sendMail(message, function(error, info) {
                console.log("Info about SMTP send ---- ", error, info);
            });
        });
        resolve();
    });
};

/**
 * Send emails/contact form with the subject and content to recipient/s using Mailgun.
 * @method sendMailgunEmail
 * @param {Object} body Contains the array of email Ids of the recipients, and the subject and content of the mail
 * @returns {Promise} Returns Promise with proper error messages if any.
 */
module.exports.sendMailgunEmail = function(body, isEmail) {
    return new Promise(function(resolve, reject) {
        mg.messages.create(process.env.MAILGUN_HOST, {
                from: isEmail ? process.env.MAILGUN_FROM_EMAIL : body.fromEmailId,
                to: isEmail ? body.emailId : process.env.MAIL_DEFAULT_TO,
                subject: body.subject,
                html: body.content
            })
            .then(function(msg) {
                console.log("Info about mailgun send ---- ", msg);
                resolve({ message: msg.message });
            }) // logs response data 
            .catch(function(err) {
                console.log("Info about mailgun error ----- ", err);
                reject({ error: err });
            }); // logs any error 
    });
};

/**
 * Formats the output response and returns the response.
 * @method sendResponse
 * @param done - the done method that returns the response.
 */

module.exports.sendResponse = function(success, result, done) {
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