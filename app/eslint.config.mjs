import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  {
    // Locale formatting must name its locale: the browser's own would mix 20.803 and 20,803.
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name=/^toLocale(String|DateString|TimeString)$/][arguments.length=0]",
          message: "Pass a locale (LOCALE from src/lib/format.ts) or use count().",
        },
        {
          selector: "CallExpression[callee.property.name=/^toLocale(String|DateString|TimeString)$/][arguments.0.type='Identifier'][arguments.0.name='undefined']",
          message: "Pass a locale (LOCALE from src/lib/format.ts) instead of undefined.",
        },
      ],
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
