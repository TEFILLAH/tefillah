// metro.config.js - Optimized for performance
const { getDefaultConfig } = require("expo/metro-config");
const path = require('path');
const { FileStore } = require('metro-cache');

const config = getDefaultConfig(__dirname);

// Bundled Bible translations: assets/bibles/*.bible are JSON payloads shipped
// as raw assets (not part of the JS bundle) and loaded lazily on demand.
config.resolver.assetExts.push('bible');

// Stable on-disk cache (persists across restarts for faster warm builds)
const root = process.env.METRO_CACHE_ROOT || path.join(__dirname, '.metro-cache');
config.cacheStores = [
  new FileStore({ root: path.join(root, 'cache') }),
];

// Reduce workers to limit memory pressure on constrained machines
config.maxWorkers = 2;

// Exclude heavy unused platform dirs from resolution to speed bundling
config.resolver.blockList = [
  /node_modules\/.*\/android\/.*/,
  /node_modules\/.*\/ios\/.*/,
  /node_modules\/.*\/__tests__\/.*/,
  /\.git\/.*/,
];

// Reduce the transformer's heap by disabling source maps in dev when not debugging
if (process.env.EXPO_NO_SOURCEMAPS === '1') {
  config.transformer.minifierConfig = {
    compress: { drop_console: true },
  };
}

module.exports = config;
