'use strict';

var AWS = require('aws-sdk');
var Promise = require('bluebird');
// Amazon S3 configuration
AWS.config.update({
    accessKeyId: process.env.S3_ACCESS_ID,
    secretAccessKey: process.env.S3_SECRET_KEY,
    region: process.env.S3_REGION
});
var s3 = new AWS.S3();

// required to get MIME type of file
var mmm = require('mmmagic');
var Magic = mmm.Magic;
var magic = new Magic(mmm.MAGIC_MIME_TYPE);

/**
 * Uploads an array of files to the S3 bucket
 * URL returned is of the form - https://[bucket]/uploads/[objectType]/[DD]/[MM]/[YYYY]/[Timestamp]
 * @param bucket - The bucket name
 * @param objectType - Whether the file upload is for user or product, used to define path
 * @param files - array of files to be uploaded
 * @param uploadType - upload to public or private Bucket
 */
module.exports.s3UploadFile = function(bucket, objectType, objectPath, files, uploadType) {
    return new Promise(function(resolve) {
        var urls = []; // array to store the returned URL or error for each file
        var date = new Date(); // used to get the date, month and year for the file path

        files.forEach(function(image) {
            var buf = new Buffer(image);

            // get the MIME type of the file, to specify ContentType while uploading
            magic.detect(buf, function(err, result) {
                // if error, push it in the output array and check if all files have been tried and resolve
                if (err) {
                    urls.push(err);
                    if (urls.length === files.length) {
                        resolve(urls);
                    }
                } else {
                    // create the date, month, year and timestamp part of the path, ie. [DD]/[MM]/[YYYY]/[Timestamp]
                    var dateString = ('0' + date.getDate()).slice(-2) + '/' +
                        ('0' + (date.getMonth() + 1)).slice(-2) + '/' +
                        date.getFullYear() + '/' + Date.now();

                    // concat the strings to form the complete upload key
                    var key = 'public/' + objectPath + '/' + objectType + '/' + dateString;

                    // specify the parameters to upload the file
                    // the file is in buf, path in key and bucket name in bucket
                    // if ContentType is not specified the file doesn't open in browser, is downloaded instead.
                    // if ACL is not specified, the file cannot be accessed directly by URL publicly. Needs a signed key to
                    // access the file
                    var params = { Bucket: bucket, Key: key, Body: buf, ContentType: result, ACL: 'public-read' };
                    var flag = false;
                    if (uploadType === 'private') {
                        params.ACL = uploadType;
                        params.Key = 'private/' + objectPath + '/' + objectType + '/' + dateString;
                        key = params.Key;
                        flag = true;
                    }

                    s3.putObject(params, function(err) {
                        if (err) {
                            urls.push(err);
                        } else {
                            // create the file URL from the data URL and key and push it into the output array
                            urls.push(process.env.S3_DATA_URL + '/' + key);
                        }
                        // if all files have been tried, return the output array of URLs and errors
                        if (urls.length === files.length) {
                            if (flag) {
                                resolve({ bucket: params.Bucket, key: params.Key })
                            } else {
                                resolve(urls);
                            }
                        }
                    });
                }
            });
        });
    });
};


/**
 * Downloads the a specified file by given bucket and key
 * @method downloadFileFromS3
 * @param {String}bucket - The bucket name of file to be downloaded
 * @param {String}key - The key of file to be downloaded
 */
module.exports.downloadFileFromS3 = function(bucket, key) {
    return new Promise(function(resolve, reject) {
        var params = { Bucket: bucket, Key: key };
        var s3 = new AWS.S3();
        s3.getObject(params, function(err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        })
    });
};