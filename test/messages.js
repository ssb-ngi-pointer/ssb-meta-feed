const test = require('tape')
const messages = require('../messages')
const keys = require('../keys')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')

const seed_hex = '4e2ce5ca70cd12cc0cee0a5285b61fbc3b5f4042287858e613f9a8bf98a70d39'
const seed = Buffer.from(seed_hex, 'hex')
const mfKey = keys.deriveFeedKeyFromSeed(seed, 'ssb-meta-feeds-v1:metafeed')

const dir = '/tmp/metafeeds-messages'

rimraf.sync(dir)

let sbot = SecretStack({ appKey: caps.shs })
  .use(require('ssb-db2'))
  .use(require('../query'))
  .call(null, {
    keys: mfKey,
    path: dir,
  })
let db = sbot.db

test('metafeed announce', (t) => {
  messages.generateAnnounceMsg(mfKey, sbot, (err, msg) => {
    t.equal(msg.metafeed, mfKey.id, 'correct metafeed')
    t.equal(msg.tangle.metafeed.root, null, 'no root')
    t.equal(msg.tangle.metafeed.previous, null, 'no previous')

    db.publish(msg, (err, announceMsg) => {

      // test that we fucked up somehow and need to create a new metafeed
      sbot.db.onDrain('base', () => {
        const mf2Key = keys.deriveFeedKeyFromSeed(seed, 'ssb-meta-feeds-v1:metafeed2')
        messages.generateAnnounceMsg(mf2Key, sbot, (err, msg) => {
          t.equal(msg.metafeed, mf2Key.id, 'correct metafeed')
          t.equal(msg.tangle.metafeed.root, announceMsg.key, 'correct root')
          t.equal(msg.tangle.metafeed.previous, announceMsg.key, 'correct previous')

          db.publish(msg, (err, announceMsg2) => {
            
            // another test to make sure previous is correctly set
            sbot.db.onDrain('base', () => {
              const mf3Key = keys.deriveFeedKeyFromSeed(seed, 'ssb-meta-feeds-v1:metafeed3')
              messages.generateAnnounceMsg(mf3Key, sbot, (err, msg) => {
                t.equal(msg.metafeed, mf3Key.id, 'correct metafeed')
                t.equal(msg.tangle.metafeed.root, announceMsg.key, 'correct root')
                t.equal(msg.tangle.metafeed.previous, announceMsg2.key, 'correct previous')

                t.end()
              })
            })
          })
        })
      })
    })
  })
})

test('metafeed seed save', (t) => {
  const msg = messages.generateSeedSaveMsg(mfKey.id, sbot.id, seed)

  t.equal(msg.metafeed, mfKey.id, 'correct metafeed')
  t.equal(msg.seed.length, 64, 'correct seed')
  t.equal(msg.recps.length, 1, 'recps for private') 
  t.equal(msg.recps[0], sbot.id, 'correct recps')

  db.publish(msg, (err, publish) => {
    t.equal(typeof publish.value.content, 'string', 'encrypted')
    db.get(publish.key, (err, dbPublish) => {
      t.equal(dbPublish.content.seed, seed_hex, 'correct seed extracted')
      sbot.close(t.end)
    })
  })
})
