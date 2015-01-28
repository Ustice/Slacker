/*
 * Authentication helper for bot.js.
 * Authenticates users that want to run actions requiring authorization.
 */
'use strict';

var _ = require('lodash');
var bot = require(__dirname + '/bot.js')
var config = require(__dirname + '/library/config');
var log = require(__dirname + '/library/log.js')
var parse = require(__dirname + '/library/parse.js')
var redis = require('redis');
var redisClient = redis.createClient();
var url = require('url');
var request = require('superagent');

exports.checkUserIsAuthenticated = function(data, response, doIfAuthenticated) {
  redisClient.sismember(config.REDIS_AUTH_USERS_SET, data.user_id, function(err, userIsAuthenticated) {
    if (err) {
      log.error(err);
      throw err;
    } else {
      if (userIsAuthenticated) {
        redisClient.hget(data.user_id, "accessToken", function(err, accessToken) {
          if (err) {
            log.error(err);
            throw err;
          } else {
            data.accessToken = accessToken;
            return doIfAuthenticated(data);
          }
        });
      } else {
        return authenticate(data, response);
      }
    }
  });
}

function authenticate(data, response) {
  redisClient.hget(data.user_id, "queuedActions", function(err, pastQueuedActionsList) {
    if (err) {
      log.info("Something wasn't right with redis.");
      console.error("Unable to get queuedActions from redis for user " + data.user_id);
      throw err;
    } else {
      var actionData = {
        "timeStamp": new Date(Date.now()).toLocaleString(),
        "data": data
      }

      if (pastQueuedActionsList === null) {
        //user has never tried to issue an authenticated action before
        var state = createStateNonce();

        var userState = {
          "state": state,
          "teamDomain": data.team_domain,
          "teamID": data.team_id,
          "queuedActions": JSON.stringify([actionData])
        }

        redisClient.hmset(data.user_id, userState, function(err, res) {
          if (err) {
            log.info("Something wasn't right with redis.");
            console.error("Unable to save state to redis for user " + data.user_id);
            throw err;
          } else {
            log.info("Added user " + data.user_id + " to redis");
            //TODO: add a state -> user_id mapping instead of concatenating them
            return createAuthorizeResponse(response, state + data.user_id);
          }
        });
      } else {
        //user has tried to issue an authenticated action in the past but has never authorized us
        //enqueue this action and give him another chance to authorize us
        pastQueuedActionsList = JSON.parse(pastQueuedActionsList);
        pastQueuedActionsList.push(actionData);
        redisClient.hset(data.user_id, "queuedActions", JSON.stringify(pastQueuedActionsList), function(err, res) {
          if (err) {
            log.info("Something wasn't right with redis.");
            console.error("Unable to update queuedActions in redis for user " + data.user_id);
            throw err;
          } else {
            log.info("Updated user " + data.user_id + "'s queuedActions in redis");
            redisClient.hget(data.user_id, "state", function(err, oldState) {
              if (err) {
                log.info("Something wasn't right with redis.");
                console.error("Unable to retrieve old state from redis for user " + data.user_id);
                throw err;
              } else {
                return createAuthorizeResponse(response, oldState + data.user_id);
              }
            });
          }
        });
      }
    }
  })
};

function createAuthorizeResponse(response, state) {
  response.statusCode = 200;
  response.end("You need to authorize slackbot to do that for you: <" + createAuthorizeURL(state) + ">" +
    "\nYou only need to do this once. Your command will be run once you've authorized us");
  return true;
}

exports.handleOauthCallback = function(request, response) {
  request.url = url.parse(request.url)
  request.url.parameters = request.url.query ? parse.httpParameters(request.url.query) : []
  if (request.url.parameters.error) {} else {
    var userId = request.url.parameters.state.substring(config.STATE_NONCE_LENGTH);
    var state = request.url.parameters.state.substring(0, config.STATE_NONCE_LENGTH);
    var code = request.url.parameters.code;
    checkStateIsValid(state, userId, code, response);
  }
}

function checkStateIsValid(receivedState, userId, code, response) {
  redisClient.hget(userId, "state", function(err, sentState) {
    if (err) {
      log.info("Something wasn't right with redis.");
      console.error("Unable to get state from redis for user " + userId);
      throw err;
    }

    if (receivedState === sentState) {
      request
        .get("https://slack.com/api/oauth.access?" + "client_id=" + config.authClientId +
          "&client_secret=" + config.authClientSecret + "&code=" + code)
        .end(function(err, res) {
          if (res.ok) {
            var responseJSON = res.body;
            if (responseJSON && responseJSON.ok === true) {
              return saveAccessToken(responseJSON.access_token, userId, response);
            } else {
              response.statusCode = 400;
              //TODO: add handlebar template for this error
              return response.end("Something went wrong with authentication.");
            }
          }
        });
    } else {
      response.statusCode = 400;
      //TODO: add handlebar template for this error
      return response.end("State was invalid; expected: " + sentState + ", received: " + receivedState);
    }
  });
}

//TODO: add a slack command to revoke user's auth token
//      this will clear any queued actions
//      and remove user from authenticated set
function saveAccessToken(accessToken, userId, response) {
  redisClient.hset(userId, "accessToken", accessToken, function(err, res) {
    if (err) {
      log.info("Something wasn't right with redis.");
      console.error("Unable to save accessToken for userId " + userId + " to redis");
      throw err;
    }
    log.info("Updated user " + userId + "'s access token to " + accessToken);
    recordThatUserIsAuthorized(accessToken, userId, response);
  });
}

function recordThatUserIsAuthorized(accessToken, userId, response) {
  redisClient.sadd(config.REDIS_AUTH_USERS_SET, userId, function(err, res) {
    if (err) {
      log.info("Something wasn't right with redis.");
      console.error("Unable to add userId " + userId + " to authenticated users set in redis");
      throw err;
    }
    log.info("User " + userId + " is now authorized.");
    displayAuthSuccessPage(accessToken, userId, response);
  });
}

function displayAuthSuccessPage(accessToken, userId, response) {
  request
    .get("https://slack.com/api/users.info?token=" + accessToken + "&user=" + userId)
    .end(function(err, res) {
      if (err) {
        log.info("Unable to fetch user name from Slack for user with id " + userId);
        throw err;
      } else {
        var userName;
        if (res.ok) {
          var responseJSON = res.body;
          if (responseJSON && responseJSON.ok === true) {
            userName = responseJSON.user.name;
          }
        }
        userName = userName || actions[actions.length - 1].data.user_name;
        redisClient.hget(userId, "queuedActions", function(err, actions) {
          if (err) {
            log.info("Something wasn't right with redis.");
            console.error("Unable to get queuedActions for userId " + userId + " from redis");
            throw err;
          } else {
            //TODO: add partials. check out lodash templates
            var actions = JSON.parse(actions);
            response.render('authSuccess', {
              userId: userId,
              userName: userName,
              actionsList: actions
            });
          }
        });
      }
    });
}

/*
 * This function is only used right after authentication for the queued actions
 * that the user has chosen to run.
 */
exports.performAuthenticatedActions = function(userId, selectedActionIndices, response) {
  //fetch token and queuedActions
  var indices = []
  for (var idx in selectedActionIndices) indices.push(idx.split('-')[0]);
  redisClient.hget(userId, "queuedActions", function(err, actionsData) {
    if (err) {
      log.info("Something wasn't right with redis.");
      console.error("Unable to get queuedActions for userId " + userId + " from redis");
      throw err;
    } else {
      actionsData = JSON.parse(actionsData);
      redisClient.hdel(userId, "queuedActions", function(err, res) {
        if (err) {
          log.info("Something wasn't right with redis.");
          console.error("Unable to delete queuedActions for userId " + userId + " from redis");
          throw err;
        } else {
          _.forEach(indices, function(idx) {
            var action = actionsData[idx];
            var command = _.clone(action.data.command);
            var data = action.data;
            bot.processCommand(command, data, response, function(message) {
              bot.sendMessage(message + "\n*Action command*: `" + command.name + "`" +
                "\n*Action initially requested at*: " + action.timeStamp, userId,
                function(err, res) {
                  if (err) {
                    console.error("Unable to message userId " + userId + ", error: " + err);
                  } else {
                    if (res.body.ok) {
                      log.info("Sent userId " + userId + " message " + message);
                    } else {
                      log.error("Unable to mesage userId " + userId + ", error: " + JSON.stringify(res.body));
                    }
                  }
                });
            });
          });
        }
      });
    }
  });
}

function createStateNonce() {
  var ALLOWED_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";
  var state = "";
  for (var i = 0; i < config.STATE_NONCE_LENGTH; i++)
    state += ALLOWED_CHARS.charAt(Math.random() * ALLOWED_CHARS.length);
  return state;
}

function createAuthorizeURL(state) {
  return "https://slack.com/oauth/authorize?" + "client_id=" + config.authClientId + "&" + "state=" + state;
}