var bot = require(__dirname + '/../bot.js')

var https = require('https')

var action = {
  name: 'gif',

  trigger: /^gif ".*"$/,

  description: 'Display a random GIF from Giphy.',

  apiKey: 'dc6zaTOxFJmzC',

  execute: function(data, callback) {
    var tag = data.text.substring(data.text.indexOf('\"') + 1, data.text.length - 1)
    tag = tag === 'random' ? '' : '&tag=' + tag.replace(/ /g, '%20')

    var options = {
      hostname: 'api.giphy.com',
      port: 443,
      path: '/v1/gifs/random?api_key=' + this.apiKey + tag,
      method: 'GET'
    }

    var request = https.request(options, function(response) {
      var responseText = ''
      response.on('data', function(data) {
        responseText += data.toString()
      })
      response.on('end', function() {
        try {
          callback(JSON.parse(responseText).data.image_url)
        } catch (exception) {
          throw exception
        }
      })
    })
    request.end()

    request.on('error', function(error) {
      throw error
    })
  }
}

bot.addAction(action)
