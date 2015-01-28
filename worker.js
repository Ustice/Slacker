var express = require('express');
var bodyParser = require('body-parser');
var router = require(__dirname + '/router.js');
var config = require(__dirname + '/library/config')
var log = require(__dirname + '/library/log.js')
var bot = require(__dirname + '/bot.js')
var consolidate = require('consolidate');

exports.start = function() {
  bot.setup(function(error) {
    if (error) {
      log.error('bot setup failed', error)
      process.exit(config.BOT_START_FAILED)
    }

    var app = express();
    app.use(bodyParser.urlencoded({
      extended: false
    }));
    app.use('/', router);
    app.engine('hbs', consolidate.handlebars);
    app.use(express.static(__dirname + '/public'));
    app.set('view engine', 'hbs');
    app.set('views', __dirname + '/views');
    app.listen(process.env.PORT || config.port, function() {
      log.info('listening on port ' + (process.env.PORT || config.port))
    });
  });
}