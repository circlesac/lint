import eslint from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		ignores: ["**/dist/**", "**/coverage/**", "**/build/**", "**/node_modules/**", "**/.vercel/**", "**/.mastra/**", "**/.sst/**", "**/.open-next/**", "**/.next/**"]
	},
	{
		languageOptions: {
			parser: tseslint.parser
		},
		plugins: {
			"@typescript-eslint": tseslint.plugin
		},
		rules: {
			"@typescript-eslint/no-unused-expressions": [
				"error",
				{
					allowShortCircuit: false
				}
			],
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_.*",
					varsIgnorePattern: "^_.*",
					caughtErrorsIgnorePattern: "^_.*"
				}
			],
			"@typescript-eslint/no-require-imports": "warn",
			"no-console": ["error", { allow: ["debug", "error", "info", "trace", "warn"] }],
			"no-empty": "off",
			"no-case-declarations": "off"
		}
	},
	{
		files: ["**/*.cjs", "**/babel.config.js"],
		languageOptions: {
			globals: {
				require: "readonly",
				module: "readonly",
				exports: "readonly",
				__dirname: "readonly",
				__filename: "readonly",
				process: "readonly",
				global: "readonly",
				console: "readonly"
			}
		}
	}
)
