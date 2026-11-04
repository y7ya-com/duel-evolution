import { resolve } from 'node:path';
import { devAssetsPlugin, devOriginGate, localProxyOptions } from './tools/dev-assets.mjs';
// All trust rewriting is confined to this loopback-only development server.
const upstream = process.env.DE_SERVER || 'http://127.0.0.1:8787';
const publicOrigin = process.env.DE_PUBLIC_ORIGIN || 'http://localhost:8787';
const port = 5174;
const proxy = () => localProxyOptions({ target:upstream,publicOrigin,port });
export default {
  plugins: [devOriginGate({ port }),devAssetsPlugin({ gameRoot:process.env.YO2_GAME,cardsRoot:process.env.YO2_CARDS })],
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
