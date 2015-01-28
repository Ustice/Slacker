'use strict';

// NPM modules
var _ = require('lodash');
var fs = require('fs');
var querystring = require('querystring');
var request = require('superagent');

// Libraries
var config = require(__dirname + '/library/config');
var log = require(__dirname + '/library/log.js');
var parse = require(__dirname + '/library/parse.js');

// Helpers
var authenticationHelper = require(__dirname + '/authenticationHelper.js');

exports.actions = [];

exports.setup = function setup(callback) {
  var setup;
  var x;

  fs.readdir(__dirname + '/actions', function(error, files) {
    var errors = [];
    if (error) return callback(error, files);

    _.each(files, function(file) {
      require(__dirname + '/actions/' + file);
    });

    _.each(exports.actions, function runSetup(action) {
      setup = action.setup;
      if (setup && _.isFunction(setup)) setup(function(error, data) {
        console.log('Running setup of ' + file);
        if (error) {
          errors.push(error);
          log.error(new Error('error running setup function on ' + data.name));
        } else {
          log.info('Success running setup function of action' + data.name);
        }
      });

    });

    log.info('bot setup complete');
    callback((errors.length > 0) ? errors : null, exports.actions);
  });
};

exports.processRequest = function processRequest(request, response) {
  var input;
  var outgoingData;

  input = request.body.text;

  // The keys on this object will be replaced with their corresponding values
  // at runtime.
  var VARIABLES = {
    'HERE': '#' + request.body.channel_name,
    'ME': '@' + request.body.user_name,
    'TODAY': new Date(Date.now()).toDateString(),
    'NOW': new Date(Date.now()).toLocaleTimeString(),
    'DOMAIN': request.body.team_domain
  };

  _.each(VARIABLES, function(value, key) {
    var regex = new RegExp('%24' + key, 'gm');
    input = input.replace(regex, value);
  });

  var requestText = decodeURIComponent(input.replace(/\+/g, '%20'));
  log.info('bot processing request', request.body, request.id);

  outgoingData = {
    channel_id: request.body.channel_id,
    channel_name: request.body.channel_name,
    team_domain: request.body.team_domain,
    team_id: request.body.team_id,
    text: requestText,
    timestamp: request.body.timestamp,
    user_id: request.body.user_id,
    user_name: request.body.user_name,
    request_id: request.id
  };

  var commands = parse.commands(input);
  _.each(commands, function(command) {
    exports.processCommand(command, outgoingData, response);
  });
};

exports.processCommand = function(command, data, response, authHelperCallback) {
  var responseText;
  var pipedResponse = null;
  var actionFound = _.find(exports.actions, {
    name: command.name
  });

  var isFromAuthHelper = _.isFunction(authHelperCallback);

  if (!actionFound) {
    log.error('no bot action found', data.text, data.request_id);
    responseText = 'Invalid action, try `help`.';
    response.statusCode = 200;
    return response.end(responseText);
  }

  // If the action hasn't completed in time, let the user know.
  setTimeout(function() {
    if (!responseText) {
      log.error('bot action timed out', actionFound.name, data.request_id);
      response.statusCode = 500;
      return response.end();
    }
  }, config.timeout);

  data.command = _.clone(command);
  data.pipedResponse = _.clone(pipedResponse);

  if (actionFound.requiresAuth) {
    authenticationHelper.checkUserIsAuthenticated(data, response, function(data) {
      actionFound.execute(data, actionCallback);
    });
  } else {
    actionFound.execute(data, actionCallback);
  }

  function actionCallback(actionResponse) {
    responseText = actionResponse;

    // No data back form the action.
    if (!responseText) {
      if (isFromAuthHelper) {
        authHelperCallback("Your action did not return a response");
      } else {
        response.statusCode = 500;
        response.end();
      }
      log.error('action did not return a response', actionFound.name, data.request_id);
      return;
    }

    // Success. Now, format the responseText.
    log.info('bot responding with action', actionFound.name, data.request_id);
    if (typeof responseText === 'string') {
      responseText.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
    } else {
      responseText = JSON.stringify(responseText);
    }

    // If the command should be piped, save the result.
    if (command.pipe) {
      pipedResponse = responseText;
      return true;
    } else {
      pipedResponse = null;
    }

    // User is ending their command with the `>`. Assume current room.
    if (command.redirects && !command.redirectTo.length) {
      command.redirectTo.push({
        type: 'channel',
        name: data.channel_name
      });
    }

    // If the response should be redirected, then do so
    if (command.redirectTo.length > 0) {
      _.each(command.redirectTo, function(redirect) {
        switch (redirect.type) {
          case 'user':
            exports.sendMessage(responseText, '@' + redirect.name);
            break;

          case 'channel':
            exports.sendMessage(responseText, '#' + redirect.name);
            break;

          case 'group':
            exports.sendMessage(responseText, '#' + redirect.name);
            break;

          case 'file':
            // Todo file creation/editing
            break;

          default:
            break;
        }
      });
      return true;
    }

    if (isFromAuthHelper) {
      authHelperCallback("Your action finished successfully.\n" +
        "*Action response*: " + responseText);
    } else {
      response.statusCode = 200;
      response.end(responseText);
    }
    log.info('bot successfully responded', {}, data.request_id);

    return true;
  }
}

exports.addAction = function(action) {
  if (!action.description || !action.execute) {
    log.error('Invalid bot action', action);
    return false;
  }

  var existing = _.find(exports.actions, {
    name: action
  });

  if (existing) {
    log.error('Bot action trigger collision', action.trigger);
    return false;
  }

  log.info('Bot action added: ' + action.name);
  exports.actions.push(action);
  return action;
};

//TODO: this should be an authorized action. We must fetch the user's actual token
//or ask him to authorize, if it doesn't exist
exports.sendMessage = function(message, channel, callback) {
  callback = callback || function() {};
  var messageData = {
    token: config.token.user,
    channel: channel,
    text: message
  };

  var url = 'https://slack.com/api/chat.postMessage?' + querystring.stringify(messageData);
  request
    .get(url)
    .end(callback);
};