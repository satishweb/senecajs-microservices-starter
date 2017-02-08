'use strict';

/*
 * this is a POST action for the Email microservice
 * It is used to send emails using nodemailer module
 */
var utils = require(__base + '/sharedlib/utils');
var lodash = require('lodash');
var Joi = require('joi');
var Promise = require('bluebird');
var microtime = require('microtime');
var nodemailer = require('nodemailer');
var emailLib = require(__base + '/lib/email');


/**
 * @module send
 */

//Joi validation Schema
//TODO: MOVE THIS
var validationSchema = Joi.object().keys({
    emailId: Joi.array().items(
        Joi.string().regex(/^\s*[\w\-\+​_]+(\.[\w\-\+_​]+)*\@[\w\-\+​_]+\.[\w\-\+_​]+(\.[\w\-\+_]+)*\s*$/).required()
    ),
    content: Joi.string().trim().required(),
    subject: Joi.string().trim().required()
});

/**
 * This is a send action for the Email microservice
 */
module.exports = function(options) {
    var seneca = options.seneca;
    return function(args, done) {
        //console.log(args.header);
        if ((args.header.origin === process.env.HTTPSCHEME + '://' + process.env.APP_URL) || (args.header.origin === 'http://' + process.env.APP_URL) || (process.env !== 'prod' && (args.header.origin && args.header.origin.match('chrome-extension')) || args.header['user-agent'].match('PostmanRuntime'))) {
            utils.checkInputParameters(args.body, validationSchema)
                .then(function() {
                    //var body = JSON.parse(JSON.stringify(args.body));
                    args.body.emailId = lodash.uniqBy(args.body.emailId); // remove any repeated emailIds
                    // construct email message
                    switch (process.env.MAIL_DEFAULT_SERVICE) {
                        case 'MAILGUN':
                            return emailLib.sendMailgunEmail(args.body, true);
                            break;
                        default:
                            return emailLib.sendSmtpEmails(args.body);
                    }
                })
                .then(function(response) {
                    return emailLib.sendResponse(true, response, done);
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