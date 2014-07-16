var bot = require(__dirname + '/../bot.js');

var id = require('../library/id.js');

var action = {
  name: 'talky',

  trigger: /^talky\s*(.*)$/,

  description: 'Create a talky room for video conferencing and video chatting.',

  execute: function(data, callback) {
    var payload = {
      username: 'Talky',
      icon_emoji: ':app-talky:',
      text: 'Join the conference: <http://talky.io/' + id + '>.'
    };

    data = data || id();

    callback(payload.text);
  }
};

bot.addAction(action);
