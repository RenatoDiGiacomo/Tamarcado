/** Jest — testes unitários (*.spec.ts em src/). */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  collectCoverageFrom: ["**/*.ts"],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
};
