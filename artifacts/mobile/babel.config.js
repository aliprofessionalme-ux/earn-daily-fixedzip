const path = require("node:path");

function resolveRouterAppRoot() {
  try {
    const routerEntry = require.resolve("expo-router/entry");
    return path.relative(path.dirname(routerEntry), path.join(__dirname, "app")) || ".";
  } catch {
    return "../../app";
  }
}

const routerAppRoot = process.env.EXPO_ROUTER_APP_ROOT || resolveRouterAppRoot();
const routerAbsAppRoot = process.env.EXPO_ROUTER_ABS_APP_ROOT || path.join(__dirname, "app");
process.env.EXPO_ROUTER_APP_ROOT = routerAppRoot;
process.env.EXPO_ROUTER_ABS_APP_ROOT = routerAbsAppRoot;
process.env.EXPO_PROJECT_ROOT = process.env.EXPO_PROJECT_ROOT || __dirname;

function inlineExpoRouterEnv(api) {
  const { types: t } = api;
  const replacements = {
    EXPO_PROJECT_ROOT: process.env.EXPO_PROJECT_ROOT || __dirname,
    EXPO_ROUTER_ABS_APP_ROOT: routerAbsAppRoot,
    EXPO_ROUTER_APP_ROOT: routerAppRoot,
    EXPO_ROUTER_IMPORT_MODE: process.env.EXPO_ROUTER_IMPORT_MODE || "sync",
  };

  return {
    name: "inline-expo-router-env-fallback",
    visitor: {
      MemberExpression(memberPath) {
        if (!memberPath.get("object").matchesPattern("process.env")) return;
        const key = memberPath.toComputedKey();
        if (!t.isStringLiteral(key)) return;
        const value = replacements[key.value];
        if (typeof value !== "string") return;
        memberPath.replaceWith(t.stringLiteral(value));
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: [inlineExpoRouterEnv],
  };
};
