import { registerRootComponent } from "expo";
import { ExpoRoot } from "expo-router";
import React from "react";

export function App() {
  const context = require.context("./app");
  return React.createElement(ExpoRoot, { context });
}

registerRootComponent(App);
