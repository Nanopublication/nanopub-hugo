let config = require('semantic-release-preconfigured-conventional-commits')
config.tagFormat = 'v${version}'
config.branches = ['release']
config.plugins.push(
  '@semantic-release/github',
  '@semantic-release/git'
)
module.exports = config
