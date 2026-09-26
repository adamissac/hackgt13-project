// Let Metro bundle ../docs/mocks/*.json (mock mode) from outside the app folder.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../docs')];

module.exports = config;
