const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const DIST_PATH = path.join(__dirname, 'dist');
const APP_PATH = path.join(__dirname, 'src');

module.exports = {
    entry: APP_PATH,
    output: {
        filename: 'bundle.js',
        path: DIST_PATH,
        clean: true,
    },

    resolve: {
        extensions: ['.ts', '.tsx', '.js'],
    },

    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },

    plugins: [
        new HtmlWebpackPlugin({
            inject: true,
            template: path.join(APP_PATH, 'template.html'),
        }),
    ],

    devServer: {
        static: APP_PATH,
        open: true,
        port: 9999,
        client: {
            logging: 'warn',
            overlay: true,
        },
    },

    stats: 'minimal',
};
