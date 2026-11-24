// Expo resolves this before native icon and web export assets are accessed.
// All generated PNGs derive from the canonical source-controlled Stuora SVG.
const { generate } = require('./scripts/generate-stuora-native-icons.cjs');
module.exports = ({ config }) => {
  generate();
  return config;
};
