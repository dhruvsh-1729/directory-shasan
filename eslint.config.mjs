import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off", // Allow usage of 'any' type
      "@typescript-eslint/explicit-module-boundary-types": "off", // Don't require return types on functions
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }], // Warn instead of error for unused variables, ignore variables starting with '_'
      "@typescript-eslint/strict-boolean-expressions": "off", // Disable strict boolean expressions
    },
  },
];

export default eslintConfig;
