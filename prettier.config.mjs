export default {
	printWidth: 180,
	singleQuote: false,
	jsxSingleQuote: false,
	semi: false,
	tabWidth: 4,
	useTabs: true,
	bracketSpacing: true,
	arrowParens: "always",
	trailingComma: "none",
	overrides: [
		{
			files: ["*.yml", "*.json", "*.js"],
			options: {
				tabWidth: 2,
				useTabs: false,
				semi: true
			}
		},
		{
			files: ["*.md"],
			options: {
				tabWidth: 2,
				useTabs: false
			}
		}
	]
}
