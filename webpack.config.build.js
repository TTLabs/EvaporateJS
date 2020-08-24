const path = require('path')

const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')

const CommonWebpack = require('./webpack.config.common')

const plugins = []

if (process.argv.includes('--analyze')) {
  plugins.push(new BundleAnalyzerPlugin())
}

module.exports = {
  ...CommonWebpack,
  plugins,
  output: {
    filename: 'bundle.js',
    library: 'Evaporate',
    libraryTarget: 'umd',
    libraryExport: 'default',
    globalObject: 'this',
    path: path.resolve(__dirname, 'dist')
  }
}
