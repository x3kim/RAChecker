// Standard Expo Metro config. The mobile app is self-contained (the shared
// hashing core is vendored at src/core), so no monorepo/watchFolders setup is
// needed — which also keeps EAS cloud builds (that upload only mobile/) working.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
