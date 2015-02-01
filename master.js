var cluster = require('cluster')
var os = require('os')

var config = require(__dirname + '/library/config')
var worker = require(__dirname + '/worker.js')

var log = require(__dirname + '/library/log.js')

if (cluster.isMaster) {
  log.setup(function(exception) {
    if (exception) {
      console.log('failed to create logging directory')
      process.exit(1)
    }

    log.info('application started')
    console.log('application started on port:', process.env.NODE_PORT || config.ports.nodePort)

    var cores = os.cpus().length
    for (var x = 0; x < cores; x++)
      cluster.fork()

    cluster.on('exit', function(worker, code, signal) {
      log.error('worker' + worker.process.pid + ' exited', code || signal)
      if (code !== config.BOT_START_FAILED)
        cluster.fork()
    });

    cluster.on('online', function(worker) {
      log.info('worker' + worker.process.pid + ' came online')
    })

  })
} else {
  worker.start();
}