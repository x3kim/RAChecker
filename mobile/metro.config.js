// Metro config for the RAChecker monorepo. Points Metro at the repo root so it
// resolves the `ra-core` workspace (the shared hashing core) from mobile/.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);
// Watch the repo root so changes to packages/core are picked up.
config.watchFolders = [workspaceRoot];
// Resolve modules from the app first, then the repo root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;
// Allow importing the ra-core workspace by name.
config.resolver.extraNodeModules = {
  'ra-core': path.resolve(workspaceRoot, 'packages/core'),
};

module.exports = config;
