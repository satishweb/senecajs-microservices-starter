'use strict';

var nodemailer = require('nodemailer');
var mailgun = require('mailgun.js');
var mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_APIKEY });

/**
 * Send emails with the same subject and content to multiple recipients.
 * @method sendEmail
 * @param {Object} body: contains the array of email Ids of the recipients, and the subject and content of the mail
 * @returns {Promise} Returns Promise with proper error messages if any.
 */
module.exports.sendSmtpEmail = function(body) {
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
                //console.log("Info about Sending mail ---- ", error, info);
            });
        });
        resolve();
    });
};


module.exports.sendMailgunEmail = function(body) {
    return new Promise(function(resolve, reject) {
        mg.messages.create(process.env.MAILGUN_HOST, {
                from: process.env.MAILGUN_FROM_EMAIL,
                to: body.emailId,
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