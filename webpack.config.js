const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");
const dotenv = require("dotenv");

// Load environment variables from .env file (local dev).
const dotenvResult = dotenv.config();
const fileEnv = (dotenvResult && dotenvResult.parsed) || {};

// Also pick up REACT_APP_* vars already in process.env (Vercel / CI injects them here).
// process.env takes precedence so Vercel dashboard values always win over .env file.
const processReactEnv = Object.keys(process.env)
  .filter((k) => k.startsWith("REACT_APP_"))
  .reduce((acc, k) => {
    acc[k] = process.env[k];
    return acc;
  }, {});

const env = { ...fileEnv, ...processReactEnv };

// Create an object to define environment variables for the client (DefinePlugin expects key-value)
const envKeys = Object.keys(env).reduce((prev, next) => {
  prev[`process.env.${next}`] = JSON.stringify(env[next]);
  return prev;
}, {});

if (!Object.keys(env).length) {
  console.warn(
    "[webpack] No .env file found or it is empty — proceeding with empty env.",
  );
} else {
  console.log("[webpack] Injecting env keys:", Object.keys(env).join(", "));
}

module.exports = {
  entry: "./src/index.js",

  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
  },

  devServer: {
    static: "./dist",
  },

  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-react"],
          },
        },
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: "asset/resource",
      },
    ],
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: "src/index.html",
    }),
    // DefinePlugin: inject environment variables into client build
    new webpack.DefinePlugin({
      ...envKeys,
      // Also expose a single object for runtime checks: window.__ENV__
      "window.__ENV__": JSON.stringify(env || {}),
    }),
  ],

  resolve: {
    extensions: [".js", ".jsx", ".json"],
  },
};
