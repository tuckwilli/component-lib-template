const
	path = require('path'),
	outputName = 'my-lib';

module.exports = {
	entry: './src/components.js',
	devtool: 'inline-source-map',
	watch: true,
	output: {
		filename: `${outputName}.js`,
		path: path.resolve(__dirname, 'dist'),
		library: outputName,
		libraryTarget: 'umd',
		umdNamedDefine: true,
	},
	externals: {
		React: 'react',
		ReactDOM: 'react-dom',
	},
	module: {
		rules: [
			{
				test: /\.js$/,
				exclude: [/node_modules/],
				use: [{
					loader: 'babel-loader',
					options: { presets: ['env', 'react', 'stage-3'] },
				}],
			},
		],
	},
};
