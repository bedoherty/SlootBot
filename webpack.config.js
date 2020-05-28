const path = require("path");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");

module.exports = {
    entry: "./src/index.ts",
    target: "node",
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: "ts-loader",
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: [ ".ts", ".js" ],
        plugins: [
            new TsconfigPathsPlugin({})
        ]
    },
    output: {
        filename: "index.js",
        path: path.resolve(__dirname, "build")
    }
}