var config = require(__dirname + '/../library/config')
var log = require(__dirname + '/../library/log.js')
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

mongoose.connect(config.mongoDbConnectionString, function(err, res) {
  if (err) {
    log.error('failed to connect to MongoDB');
    console.log('failed to connect to MongoDB');
    process.exit(1);
  } else {
    log.info("connected to MongoDB");
    console.log("connected to MongoDB");
  }
});

var actionSchema = new Schema({
  userId: {
    type: String,
    ref: 'User',
    required: true
  },
  timeStamp: {
    type: String,
    required: true
  },
  data: {
    channel_id: {
      type: String,
      required: true
    },
    channel_name: {
      type: String,
      required: true
    },
    team_domain: {
      type: String,
      required: true
    },
    team_id: {
      type: String,
      required: true
    },
    text: {
      type: String,
      required: true
    },
    user_id: {
      type: String,
      required: true
    },
    user_name: {
      type: String,
      required: true
    },
    request_id: {
      type: String,
      required: true
    },
    command: {
      id: {
        type: String,
        required: true
      },
      name: {
        type: String,
        required: true
      },
      arguments: [{
        type: String
      }],
      switches: [{
        type: String
      }],
      pipe: {
        type: Boolean,
        required: true
      },
      redirects: {
        type: Boolean,
        required: true
      },
      redirectTo: [{
        type: String
      }],
    },
    pipedResponse: {
      type: String
    }
  }
});

exports.Action = mongoose.model('Action', actionSchema);

var userSchema = new Schema({
  _id: {
    type: String
  },
  state: {
    type: String,
    required: true
  },
  accessToken: {
    type: String
  },
  teamDomain: {
    type: String,
    required: true
  },
  teamID: {
    type: String,
    required: true
  },
  queuedActions: [{
    type: Schema.Types.ObjectId,
    ref: 'Action'
  }]
});

exports.User = mongoose.model('User', userSchema);
exports.mongoose = mongoose;
