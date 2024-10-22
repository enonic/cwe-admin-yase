/* eslint-disable no-console */
//import BrowserSyncPlugin from 'browser-sync-webpack-plugin';
import CaseSensitivePathsPlugin from 'case-sensitive-paths-webpack-plugin';
import { CleanWebpackPlugin } from 'clean-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import { EsbuildPlugin } from 'esbuild-loader';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import path from 'path';
import postcssPresetEnv from 'postcss-preset-env';
import {print} from 'q-i';
import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';

//──────────────────────────────────────────────────────────────────────────────
import {
	BOOL_LOCAL_JS_UTILS,
	BOOL_LOCAL_LIB_EXPLORER,
	BOOL_LOCAL_SEMANTIC_UI_REACT_FORM,
	BOOL_MINIMIZE,
	MODE
} from './.webpack.constants.mjs';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Check which version of node is used
print({
	//env: process.env,
	execPath: process.execPath,
	version: process.version
}, { maxItems: Infinity });

//──────────────────────────────────────────────────────────────────────────────
// Common constants
//──────────────────────────────────────────────────────────────────────────────
const SRC_DIR = 'src/main/resources';
const DST_DIR = 'build/resources/main';

const STATS = {
	colors: true,
	hash: false,
	modules: false,
	moduleTrace: false,
	timings: false,
	version: false
};

const WEBPACK_CONFIG = [];
const SRC_DIR_ABS = path.resolve(__dirname, SRC_DIR);
const DST_DIR_ABS = path.join(__dirname, DST_DIR);


//──────────────────────────────────────────────────────────────────────────────
// Assets (sass)
//──────────────────────────────────────────────────────────────────────────────
const SRC_ASSETS_DIR = `${SRC_DIR}/assets`;
const SRC_ASSETS_DIR_ABS = path.resolve(SRC_DIR_ABS, 'assets');

const DST_ASSETS_DIR = `${DST_DIR}/assets`;
const DST_ASSETS_DIR_ABS = path.join(DST_DIR_ABS, 'assets');


const SRC_STYLE_DIR = `${SRC_ASSETS_DIR}/style`;
const DST_STYLE_DIR = `${DST_ASSETS_DIR}/style`;

const STYLE_OUTPUT_PATH = path.join(__dirname, '.build');
const STYLE_OUTPUT_FILENAME = 'bundle';

const STYLE_USE = [
	MiniCssExtractPlugin.loader,
	{
		loader: 'css-loader', // translates CSS into CommonJS
		options: { importLoaders: 1 }
	},
	{
		loader: 'postcss-loader',
		options: {
			//ident: 'postcss',
			postcssOptions: {
				plugins: () => [postcssPresetEnv()]
			}
		}
	}
];

const STYLE_CONFIG = {
	context: path.resolve(__dirname, SRC_STYLE_DIR),
	devtool: MODE === 'production' ? false : 'eval-source-map', // https://webpack.js.org/configuration/devtool/#devtool
	entry: {
		'main': './main.sass'
	},
	mode: MODE,
	module: {
		rules: [
			{
				test: /\.(c|le|sa|sc)ss$/,
				use: [
					...STYLE_USE,
					// 'less-loader', // compiles Less to CSS
					'sass-loader' // compiles Sass to CSS
				]
			},
			{
				test: /\.styl$/,
				use: [
					...STYLE_USE,
					'stylus-loader' // compiles Stylus to CSS
				]
			},
			{
				test: /\.svg/,
				use: {
					loader: 'svg-url-loader',
					options: {}
				}
			}
		]
	},
	output: {
		filename: 'temporaryStyleBundle.js',
		path: STYLE_OUTPUT_PATH
	},
	plugins: [
		new CaseSensitivePathsPlugin(),
		new CleanWebpackPlugin({
			cleanOnceBeforeBuildPatterns: [STYLE_OUTPUT_PATH],
			verbose: true
		}),
		new MiniCssExtractPlugin({
			filename: `../${DST_STYLE_DIR}/${STYLE_OUTPUT_FILENAME}.css`
		})
	],
	resolve: {
		extensions: [
			'sass',
			'scss',
			'less',
			'styl',
			'css',
		].map(ext => `.${ext}`)
	},
	stats: STATS,
	target: 'web', // <=== can be omitted as default is 'web'
};
//print({STYLE_CONFIG}, { maxItems: Infinity });
//process.exit();
WEBPACK_CONFIG.push(STYLE_CONFIG);

//──────────────────────────────────────────────────────────────────────────────
// Clientside javascript
//──────────────────────────────────────────────────────────────────────────────
const CS_EXTERNALS = {
	react: 'React',
	'react-dom': 'ReactDOM'
};

const CS_MINIMIZER = [];
if(MODE === 'production') {
	CS_MINIMIZER.push(new TerserPlugin({
		extractComments: false,
		terserOptions: {
			compress: {}//,
			//mangle: true // This will DESTROY exports!
		}
	}));
}

const NODE_MODULES_CONTEXT = path.resolve(__dirname, 'node_modules');
const ASSETS_CONTEXT = path.resolve(__dirname, SRC_DIR, 'assets');

const CLIENT_JS_CONFIG = {
	context: SRC_ASSETS_DIR_ABS,
	entry: './react/index.tsx',
	externals: CS_EXTERNALS,
	devtool: MODE === 'production' ? false : 'eval-source-map', // https://webpack.js.org/configuration/devtool/#devtool
	mode: MODE,
	module: {
		rules: [{
			test: /\.jsx$/,
			//exclude: /node_modules/, // Perhaps too much?
			exclude: [ // It takes time to transpile, if you know they don't need transpilation to run in Enonic you may list them here:
				/node_modules[\\/]core-js/, // will cause errors if they are transpiled by Babel
				/node_modules[\\/]webpack[\\/]buildin/ // will cause errors if they are transpiled by Babel
			],
			use: [{
				loader: 'babel-loader',
				options: {
					babelrc: false, // The .babelrc file should only be used to transpile config files.
					comments: false,
					compact: false,
					minified: false,
					plugins: [
						'@babel/plugin-proposal-class-properties',
						'@babel/plugin-proposal-object-rest-spread',
						'@babel/plugin-syntax-dynamic-import',
						'@babel/plugin-syntax-throw-expressions',
						'@babel/plugin-transform-object-assign',
						'array-includes'
					],
					presets: [
						[
							'@babel/preset-env',
							{
								corejs: 3,

								// Enables all transformation plugins and as a result,
								// your code is fully compiled to ES5
								forceAllTransforms: true,

								targets: {
									esmodules: false // Enonic XP doesn't support ECMAScript Modules
								},

								useBuiltIns: 'usage' // false means polyfill not required runtime
							}
						],
						'@babel/preset-react'
					]
				} // options
			}]
		}]
	},
	optimization: {
		minimize: BOOL_MINIMIZE,
		minimizer: CS_MINIMIZER
	},
	output: {
		//filename: '[name].js',
		filename: 'explorer.js',
		library: 'explorer',
		libraryTarget: 'umd',
		path: DST_ASSETS_DIR_ABS
	},
	performance: {
		hints: false
	},
	plugins: [
		new CaseSensitivePathsPlugin(),
		new CopyWebpackPlugin({
			patterns: [
				// Has issues with Loaders
				//{ context: NODE_MODULES_CONTEXT, from: 'fomantic-ui-css/semantic*', to: 'semantic-ui-css/[name][ext]'},
				//{ context: NODE_MODULES_CONTEXT, from: 'fomantic-ui-css/themes', to: 'semantic-ui-css/themes'}, // Fonts

				//{ context: NODE_MODULES_CONTEXT, from: 'frappe-gantt/dist/*', to: 'frappe-gantt/[name].[ext]' },
				{ context: NODE_MODULES_CONTEXT, from: 'graphiql/graphiql.min.css', to: 'graphiql//graphiql.min.css' },
				{ context: NODE_MODULES_CONTEXT, from: 'nice-react-gantt/lib/css/style.css', to: 'nice-react-gantt/style.css' },
				//{ context: NODE_MODULES_CONTEXT, from: 'jquery/dist', to: 'jquery'},
				{ context: NODE_MODULES_CONTEXT, from: 'react/umd/react.*.js', to: 'react/[name][ext]' },
				{ context: NODE_MODULES_CONTEXT, from: 'react-dom/umd/react-dom.*.js', to: 'react-dom/[name][ext]' },
				{ context: NODE_MODULES_CONTEXT, from: 'react-semantic-ui-datepickers/dist/react-semantic-ui-datepickers.css', to: 'react-semantic-ui-datepickers/react-semantic-ui-datepickers.css' },

				// Used to have issues, seems to work better than fomantic now. For example Loaders.
				{ context: NODE_MODULES_CONTEXT, from: 'semantic-ui-css/semantic*', to: 'semantic-ui-css/[name][ext]'},
				{ context: NODE_MODULES_CONTEXT, from: 'semantic-ui-css/themes', to: 'semantic-ui-css/themes'}, // Fonts

				//{ context: NODE_MODULES_CONTEXT, from: 'semantic-ui/dist', to: 'semantic-ui'},
				{ context: NODE_MODULES_CONTEXT, from: 'semantic-ui-react/dist', to: 'semantic-ui-react'},
			]
		}),
		new CopyWebpackPlugin({
			patterns: [
				{ context: ASSETS_CONTEXT, from: 'js', to: 'js'}
			]
		})
	],
	resolve: {
		/*alias: { // NOTE: If the local lib-explorer is not the newest there could be trouble...
			'/lib/explorer': path.resolve(__dirname, '../lib-explorer/src/main/resources/lib/explorer/')
		},*/
		extensions: [
			'mts', // @enonic/lib-explorer
			'mjs',
			'es',
			'js',
			'jsx',
			'ts',
			'tsx',
		].map(ext => `.${ext}`)
	},
	stats: STATS,
	target: 'web', // <=== can be omitted as default is 'web'
};
//print({CLIENT_JS_CONFIG}, { maxItems: Infinity });
//process.exit();
WEBPACK_CONFIG.push(CLIENT_JS_CONFIG);


//──────────────────────────────────────────────────────────────────────────────
// Clientside Ecmascript modules
//──────────────────────────────────────────────────────────────────────────────
//const ESBUILD_TARGET = 'es2015'; // ERROR: Transforming async generator functions to the configured target environment ("es2015") is not supported yet
const ESBUILD_TARGET = 'esnext'; // ERROR: Transforming async generator functions to the configured target environment ("es2015") is not supported yet
const CLIENT_ES_CONFIG = {
	context: path.join(__dirname, SRC_ASSETS_DIR, 'react'),
	devtool: MODE === 'production' ? false : 'eval-source-map', // https://webpack.js.org/configuration/devtool/#devtool
	entry: {
		'Explorer': './App.tsx',
		'WebCrawler': './WebCrawler.tsx'
	},
	externals: CS_EXTERNALS,
	mode: MODE,
	module: {
		rules: [{
			exclude: [ // It takes time to transpile, if you know they don't need transpilation to run in Enonic you may list them here:
				/node_modules[\\/]core-js/, // will cause errors if they are transpiled by Babel
				/node_modules[\\/]webpack[\\/]buildin/ // will cause errors if they are transpiled by Babel
			],
			test: /\.jsx$/,
			loader: 'esbuild-loader',
			options: {
				loader: 'jsx',
				target: ESBUILD_TARGET
			}
		}, {
			exclude: [ // It takes time to transpile, if you know they don't need transpilation to run in Enonic you may list them here:
				/node_modules[\\/]core-js/, // will cause errors if they are transpiled by Babel
				/node_modules[\\/]webpack[\\/]buildin/ // will cause errors if they are transpiled by Babel
			],
			test: /\.tsx?$/,
			loader: 'esbuild-loader',
			options: {
				loader: 'tsx',
				target: ESBUILD_TARGET
			}
		}]
	},
	optimization: {
		minimize: BOOL_MINIMIZE,
		minimizer: MODE === 'production' ? [
			new EsbuildPlugin({
				target: ESBUILD_TARGET
			})
		] : []
	},
	output: {
		filename: '[name].esm.js',
		//library: 'LIB', // If you try to load to files with the same library name the latter will overwrite the first!!!

		library: '[name]',
		// Library name base (Libreact/Explorer) must be a valid identifier when using a var declaring library type.
		// Either use a valid identifier (e. g. Libreact_Explorer) or use a different library type
		// (e. g. 'type: "global"', which assign a property on the global scope instead of declaring a variable).
		// Common configuration options that specific library names are
		// 'output.library[.name]', 'entry.xyz.library[.name]', 'ModuleFederationPlugin.name' and 'ModuleFederationPlugin.library[.name]'.

		libraryTarget: 'var',
		//libraryTarget: 'global',
		//libraryTarget: 'window',
		path: path.join(__dirname, DST_ASSETS_DIR, 'react')
	},
	performance: {
		hints: false
	},
	plugins: [
		new CaseSensitivePathsPlugin(),
		new webpack.ProvidePlugin({
			Buffer: ['buffer', 'Buffer']
		}),
		//new EsmWebpackPlugin(), // Webpack 5: Error: Cannot find module 'webpack/lib/MultiModule'
		new EsbuildPlugin()
	],
	resolve: {
		alias: {
			'@enonic/js-utils': BOOL_LOCAL_JS_UTILS
				? path.resolve(__dirname, '../enonic-js-utils')
				: path.resolve(__dirname, './node_modules/@enonic/js-utils'),
			'@enonic/semantic-ui-react-form': BOOL_LOCAL_SEMANTIC_UI_REACT_FORM
				? path.resolve(__dirname, '../semantic-ui-react-form/src')
				: path.resolve(__dirname, './node_modules/@enonic/semantic-ui-react-form/src')//,
			// NOTE: If the local lib-explorer is not the newest there could be trouble...
			//'/lib/explorer': path.resolve(__dirname, '../lib-explorer/src/main/resources/lib/explorer/')
		},
		extensions: [
			'mts', // @enonic/lib-explorer
			'tsx',
			'ts',
			'mjs',
			'jsx',
			'esm',
			'es',
			'es6',
			'js',
			'json',
		].map(ext => `.${ext}`)
	},
	stats: STATS,
	target: 'web', // <=== can be omitted as default is 'web'
};
//print({CLIENT_ES_CONFIG}, { maxItems: Infinity });
//process.exit();
WEBPACK_CONFIG.push(CLIENT_ES_CONFIG);

//print({WEBPACK_CONFIG}, { maxItems: Infinity });
//process.exit();

export { WEBPACK_CONFIG as default };
