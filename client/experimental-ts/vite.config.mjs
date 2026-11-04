import { resolve } from 'node:path';
import { devAssetsPlugin, devOriginGate, localProxyOptions } from './tools/dev-assets.mjs';
import { createRemoteAssetMiddleware } from './tools/remote-assets.mjs';
// All trust rewriting is confined to this loopback-only development server.
const upstream = process.env.DE_SERVER || 'http://127.0.0.1:8787';
const publicOrigin = process.env.DE_PUBLIC_ORIGIN || 'http://localhost:8787';
const port = Number(process.env.DE_CLIENT_PORT || 5174);
const proxy = () => localProxyOptions({ target:upstream,publicOrigin,port });
const assetPlugin = process.env.YO2_ASSET_URL ? {
  name:'duel-remote-assets',apply:'serve',configureServer(server) {
    server.middlewares.use(createRemoteAssetMiddleware({baseUrl:process.env.YO2_ASSET_URL,forwardValidators:true}));
  },
} : devAssetsPlugin({gameRoot:process.env.YO2_GAME,cardsRoot:process.env.YO2_CARDS});
export default {
  plugins: [devOriginGate({ port }),assetPlugin],
  server: {
    host:'127.0.0.1',port,strictPort:true,
    proxy: {
      '/api':proxy(),
      '/net':{ ...proxy(),ws:true },
      '/__version':proxy(),
    },
    fs: { strict:true,allow:[resolve(import.meta.dirname)] },
  },
  build: { target:'es2022',outDir:'dist',sourcemap:true },
};
