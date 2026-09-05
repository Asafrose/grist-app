const preset = require("jest-expo/jest-preset");

const extraTransformed = [
  "@grist/.*",
  "@rn-primitives/.*",
  "nativewind",
  "react-native-css-interop",
  "lucide-react-native",
];

module.exports = {
  ...preset,
  transformIgnorePatterns: preset.transformIgnorePatterns.map((pattern) =>
    pattern.replace("node_modules/(?!(", `node_modules/(?!(${extraTransformed.join("|")}|`),
  ),
  moduleNameMapper: {
    ...preset.moduleNameMapper,
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.css$": "<rootDir>/jest.css-stub.js",
  },
};
