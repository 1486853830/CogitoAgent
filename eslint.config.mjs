import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  { ignores: ["dist/", "node_modules/", "coverage/", "electron/"] },
  {
    languageOptions: {
      globals: {
        describe: "readonly",
        test: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        process: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        fetch: "readonly",
        Buffer: "readonly",
        global: "readonly"
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "no-empty": "warn",
      "no-useless-assignment": "warn",
      "no-useless-escape": "warn",
      "no-async-promise-executor": "warn",
      "no-loss-of-precision": "warn",
      "preserve-caught-error": "warn",
      "no-control-regex": "warn",
      "no-unassigned-vars": "warn"
    }
  }
];
