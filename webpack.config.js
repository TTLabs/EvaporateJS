const path = require('path')

const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')

const plugins = []

if (process.argv.includes('--analyze')) {
  plugins.push(new BundleAnalyzerPlugin())
}

module.exports = {
  entry: './src/Evaporate/Evaporate.ts',
  plugins,
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  output: {
    filename: 'bundle.js',
    library: 'Evaporate',
    libraryTarget: 'umd',
    libraryExport: 'default',
    globalObject: 'this',
    path: path.resolve(__dirname, 'dist')
  }
}
