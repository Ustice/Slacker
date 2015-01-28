var authenticationHelper = require(__dirname + '/authenticationHelper.js');
var bot = require(__dirname + '/bot.js')
var cluster = require('cluster')
var config = require(__dirname + '/library/config')
var domain = require('domain');
var express = require('express');
var id = require(__dirname + '/library/id.js')
var log = require(__dirname + '/library/log.js')
var parse = require(__dirname + '/library/parse.js')
var router = module.exports = express.Router();
var url = require('url')

router.route('*')
  .all(function(request, response, next) {
    connectDomainMiddleware(request, response, next);
  });

router.route('/')
  .get(function(request, response) {
    //TODO: add handlebar template for this error
    response.end('Slacker is running.');
  })
  .post(function(request, response) {
    if (request.body.command && request.body.token === config.token.slashCommand) {
      bot.processRequest(request, response);
    } else {
      log.error('invalid token', request.body.token, request.id)
      response.statusCode = 403
      response.end()
    }
  });

router.get('/oauthcallback', function(request, response) {
  authenticationHelper.handleOauthCallback(request, response);
});

router.post('/:userId/runactions', function(request, response) {
  var userId = request.params.userId;
  var selectedActionIndices = request.body;
  authenticationHelper.performAuthenticatedActions(userId, selectedActionIndices, response);
  return response.render('actionsDone');
});

function connectDomainMiddleware(request, response, nextRequestHandler) {
  var requestDomain = domain.create();

  requestDomain.add(request);
  requestDomain.add(response);

  request.url = url.parse(request.url);
  request.url.parameters = request.url.query ? parse.httpParameters(request.url.query) : [];
  request.id = id();

  log.info('request', {
    method: request.method,
    pathname: request.url.pathname,
    parameters: request.url.parameters,
    ip: request.connection.remoteAddress
  }, request.id);

  log.info('headers', request.headers, request.id);

  requestDomain.on('error', function(error) {
    log.error('uncaught exception', error, response.id)
    console.error(error.stack);

    try {
      var kill = setTimeout(function() {
        process.exit(1)
      }, 30000)
      kill.unref()
      cluster.worker.disconnect()
      response.statusCode = 500
      response.end()
    } catch (exception) {
      log.error('failed to respond after uncaught exception', exception, response.id)
      console.error(exception.stack);
    }
  });

  requestDomain.run(function() {
    nextRequestHandler();
  });
}