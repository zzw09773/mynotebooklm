const webpack = require("webpack");

/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config, { isServer }) => {
        if (!isServer) {
            // Handle bare module names (e.g. require('fs'))
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                https: false,
                http: false,
                stream: false,
                zlib: false,
                path: false,
                crypto: false,
            };

            // Handle node: protocol prefix (e.g. require('node:fs'))
            // Strip the prefix so resolve.fallback above can intercept it
            config.plugins.push(
                new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
                    resource.request = resource.request.replace(/^node:/, "");
                }),
            );
        }
        return config;
    },
};

module.exports = nextConfig;
