const prepareBrandAssets = require("./scripts/prepare-brand-assets");
const { expo } = require("./app.json");

module.exports = () => {
  prepareBrandAssets();
  return expo;
};
