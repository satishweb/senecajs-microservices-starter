'use strict';

var winston = require('winston');

// the syslog levels are prioritized from 0 to 7 (highest to lowest)
// { emerg: 0, alert: 1, crit: 2, error: 3, warning: 4, notice: 5, info: 6, debug: 7 }
/**
 * Create Winston object
 * @method winston
 * @param microserviceName Name of the microservice for which the logs are being colle
 * @returns {Winston}
 */
module.exports = function (microserviceName) {
	var path = "";
	var logger = null;

	var settings= {
     level: (process.env.LOGGER_LEVEL===undefined)?'debug':process.env.LOGGER_LEVEL,//@todo take this value from process.env.LOGGER_LEVEL
     colorize: true,
     showLevel: true,
     timestamp: true,
     prettyPrint: true,
		 silent:false,
		 json :false
   };

	microserviceName = microserviceName || 'default';

  if (process.env.LOG_TYPE === 'file'){
  	settings.filename = path.concat(process.env.LOGGER_TYPE,'/',microserviceName,'.log');
		logger = new (winston.Logger)({
      transports: [
        new (winston.transports.Console)(settings)
      ]
    });

  }
  else {
    logger = new (winston.Logger)({
      transports: [
        new (winston.transports.Console)(settings)
      ]
    });
  }
    return logger;
};









