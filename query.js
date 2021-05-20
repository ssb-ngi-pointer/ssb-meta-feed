const pull = require('pull-stream')
const { author } = require('ssb-db2/operators')
const { seekKey } = require('bipf')
const { equal } = require('jitdb/operators')

exports.name = 'metafeeds'

exports.manifest = {
  hydrate: 'async',
}

exports.init = function (sbot, config) {
  function subfeed(feedId) {
    const bValue = Buffer.from('value')
    const bContent = Buffer.from('content')
    const bSubfeed = Buffer.from('subfeed')

    function seekSubfeed(buffer) {
      let p = 0 // note you pass in p!
      p = seekKey(buffer, p, bValue)
      if (p < 0) return
      p = seekKey(buffer, p, bContent)
      if (p < 0) return
      return seekKey(buffer, p, bSubfeed)
    }

    return equal(seekSubfeed, feedId, {
      prefix: 32,
      prefixOffset: 1,
      indexType: 'value_subfeed',
    })
  }

  return {
    getMetadata(feedId, cb) {
      sbot.db.getJITDB().all(subfeed(feedId), 0, false, false, (err, results) => {
        if (err) return cb(err)

        results = results.filter(msg => msg.value.content.type === 'metafeed/add')
        // FIXME: handle multiple results properly?
        cb(null, results[0].value.content)
      })
    },

    hydrate(feedId, cb) {
      let query = author(feedId)

      sbot.db.getJITDB().all(query, 0, false, false, (err, results) => {
        if (err) return cb(err)

        const feeds = results.filter(msg => msg.value.content.type === 'metafeed/add').map(msg => {
          const { feedformat, feedpurpose, subfeed } = msg.value.content
          return {
            feedformat,
            feedpurpose,
            subfeed
          }
        })

        const tombstoned = results.filter(msg => msg.value.content.type === 'metafeed/tombstone').map(msg => {
          const { feedformat, feedpurpose, subfeed } = msg.value.content
          return {
            feedformat,
            feedpurpose,
            subfeed
          }
        })

        cb(null, {
          feeds: feeds.filter(feed => tombstoned.filter(t => t.subfeed === feed.subfeed).length === 0),
          tombstoned
        })
      })
    }
  }
}
