import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'vitest.config.ts',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			// This plugin's UI copy is Korean; the English sentence-case rule does not apply.
			'obsidianmd/ui/sentence-case': 'off',
			// The declarative settings API (getSettingDefinitions) requires Obsidian
			// 1.13.0; manifest.minAppVersion is pinned at 1.7.2, so the imperative
			// display() tab is intentional.
			'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
		},
	},
);
