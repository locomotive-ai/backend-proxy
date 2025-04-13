const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const dotenv = require('dotenv');

// 加载.env文件
const env = dotenv.config().parsed || {};

module.exports = {
  mode: 'production',
  entry: {
    popup: './src/popup/popup.js',
    contentScript: './src/contentScript.js',
    background: './src/background.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
            plugins: ['@babel/plugin-transform-runtime']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'src/manifest.json' },
        { from: 'src/popup/popup.html' },
        { from: 'src/popup/popup.css' },
        { from: 'src/assets', to: 'assets' },
        { 
          from: 'src/resources', 
          to: 'resources',
          noErrorOnMissing: true
        },
        { from: 'src/sandbox.html' }
      ]
    }),
    new webpack.DefinePlugin({
      'process.env': JSON.stringify({
        NODE_ENV: 'production'
      })
    })
  ],
  resolve: {
    extensions: ['.js', '.jsx'],
  }
}; 