const CopyPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const path = require('path');
const webpack = require('webpack');


module.exports = {
  mode: 'production',
  //mode: 'development',
  entry: {
    webathena: {
      import: './src/webathena.js',
      filename: 'webathena.js',
    },
    index: {
      import: './src/index.js',
      dependOn: 'webathena',
    },
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Caching',
    }),
    new CopyPlugin({
      patterns: [
        { from: "src/favicon.ico" },
        { from: "src/kdc.fcgi" },
        { from: "src/gss.js" },
        { from: "src/relay.html" },
      ],
    }),
    new MiniCssExtractPlugin({
      filename: '[name].[contenthash].css',
    }),
    new webpack.ProvidePlugin({
      $: 'jquery',
      log: [path.resolve(path.join(__dirname, 'src/scripts-src/util.js')), 'log'],
      Q: 'q',
      sjcl: path.resolve(path.join(__dirname, 'src/contrib/sjcl.js')),
    }),
  ],
  module: {
    rules: [
      {
        test: /\.html$/i,
        loader: 'html-loader',
      }, {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      }, {
        test: /\.png$/i,
        type: 'asset/resource',
      }
    ],
  },
  output: {
    filename: '[name].[contenthash].bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: /@preserve/i,
      }),
    ],
    moduleIds: 'deterministic',
    runtimeChunk: 'single',
    splitChunks: {
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    },
  },
  resolve: {
    fallback: {
      "crypto": false,
    },
  },
};