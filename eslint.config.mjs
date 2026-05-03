// ESLint flat config (v9). Single config at repo root covers the whole
// monorepo (apps/client, apps/server, packages/shared) because the rules
// are nearly identical — the client gets a few extra React rules.
//
// Run from root: `pnpm lint` / `pnpm lint:fix`.
//
// Disabled rules near the bottom are pragmatic — `no-explicit-any` would
// fight with the zod-v3-vs-v4 SDK casts (see schemas.ts comments), and
// `react-hooks/exhaustive-deps` would scream at the cancelledRef pattern
// in useRecommendations. Both are documented design decisions, not
// accidents — silencing the rule globally beats peppering eslint-disable
// comments.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier/flat";

export default tseslint.config(
  // Ignore build artifacts and migrations (auto-generated SQL files
  // shouldn't be linted as code).
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.config.js",
      "**/*.config.ts",
      "apps/server/src/db/migrations/**",
    ],
  },

  // Base JS + TypeScript recommended rules, applied to every workspace.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Client-only React rules. The server has no JSX so these don't apply
  // there.
  {
    files: ["apps/client/**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        HTMLElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLTextAreaElement: "readonly",
        Headers: "readonly",
        RequestInit: "readonly",
        Response: "readonly",
        AbortController: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // React 17+ JSX transform — no need to import React in scope.
      "react/react-in-jsx-scope": "off",
      // We use TypeScript types, not PropTypes.
      "react/prop-types": "off",
      // Apostrophes as literal text are fine; HTML escape codes harm
      // readability without preventing real bugs.
      "react/no-unescaped-entities": "off",
      // react-hooks v7 added this rule but it fires on the standard
      // fetch-on-mount hook pattern (useEffect that calls a refresh
      // callback which sets state internally). The pattern is correct
      // for our useX hooks; the rule is overly strict.
      "react-hooks/set-state-in-effect": "off",
    },
    settings: { react: { version: "detect" } },
  },

  // Server has Node globals and uses different patterns (no React).
  {
    files: ["apps/server/**/*.ts"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Buffer: "readonly",
      },
    },
  },

  // One-shot Node scripts (.mjs in scripts/) need Node globals too.
  {
    files: ["**/scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
      },
    },
  },

  // Pragmatic rule overrides — apply to all TS files.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // `any` is sometimes the right answer (zod v3/v4 SDK casts, drizzle
      // dynamic builder types). Each instance is documented inline; we
      // don't want this rule firing across the codebase.
      "@typescript-eslint/no-explicit-any": "off",
      // `_var` prefix is the conventional way to mark intentionally
      // unused parameters / leading underscore destructuring.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Prettier compat — disables formatting-related rules so Prettier owns
  // formatting and ESLint owns correctness. Must be last.
  prettier,
);
