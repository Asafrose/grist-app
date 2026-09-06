const preset = require("jest-expo/jest-preset");

const extraTransformed = [
  "@grist/.*",
  "@rn-primitives/.*",
  "nativewind",
  "react-native-css-interop",
  "lucide-react-native",
  "react-native-marked",
  "marked",
  "github-slugger",
];

module.exports = {
  ...preset,
  transformIgnorePatterns: preset.transformIgnorePatterns.map((pattern) =>
    pattern.replace("node_modules/(?!(", `node_modules/(?!(${extraTransformed.join("|")}|`),
  ),
  collectCoverageFrom: ["src/lib/**/*.ts", "!src/lib/db/open.ts", "!src/lib/db/index.ts"],
  coverageThreshold: {
    "src/lib/**/*.ts": { statements: 80, branches: 60, functions: 80, lines: 80 },
  },
  moduleNameMapper: {
    ...preset.moduleNameMapper,
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.css$": "<rootDir>/jest.css-stub.js",
  },
};
