/**
 * [![Build Status](https://travis-ci.org/nxus/clientjs.svg?branch=master)](https://travis-ci.org/nxus/clientjs)
 * 
 * Integration of browserify with Nxus
 * 
 * # Configuration
 * 
 *     "config": {
 *       "clientjs": {
 *         "watchify": true,
 *         "assetPrefix": "/url/prefix/for/generated"
 *         "entries": {
 *           "path/source/file.js": "path/output/bundle.js"
 *         }
 *       }
 *     }
 * 
 * # Use with React (or other babel transforms)
 *
 * You will need to install the necessary babel presets in your application, and add the config option `babelPresets`, like:
 *
 *     npm install --save babel-preset-es2015 babel-preset-react
 *
 *     "config": {
 *       "clientjs": {
 *         "babel": {
 *           "presets": ["es2015", "react"]
 *         }
 *       }
 *
 */
'use strict';

import browserify from 'browserify'
import babelify from 'babelify'
import watchify from 'watchify'
import path from 'path'
import fs from 'fs'

var _defaultConfig = {
  watchify: true,
  assetPrefix: '/clientjs/',
  babel: {},
  entries: {}
}

class ClientJS {
  constructor (app) {
    this.app = app
    this.config = Object.assign(_defaultConfig, app.config.clientjs)
    this.output_dirs = {}
    this.app.get('clientjs').use(this)
      .gather('bundle')

    this.fromConfigBundles(app);
  }

  fromConfigBundles (app) {
    for (var entry in this.config.entries) {
      var output = this.config.entries[entry];

      this.app.get('clientjs').bundle(entry, output);
    }
  }
  
  bundle (entry, output) {
    this.app.log.debug('Bundling', entry, output)
    var output_dir = path.dirname(output);
    if (!(output_dir in this.output_dirs)) {
      this.output_dirs[output_dir] = true;
      this.app.get('router').setStatic(this.config.assetPrefix+output_dir, path.resolve(output_dir));
    }
    var options = {
      entries: [entry],
      cache: {},
      packageCache: {},
    };
    if (this.config.watchify) {
      options.plugin = [watchify];
    }
    let b = browserify(options)
      .transform(babelify.configure(this.config.babel))
      .on("log", (msg) => {
        console.log("Bundle for", output, msg)
      })
    let bundle = () => {
      b.bundle()
        .on("error", (err) => {
          console.log("Bundle error for", output, err)
        })
        .pipe(fs.createWriteStream(output));
    }
    b.on("update", bundle)
    bundle()
  }
}

export default ClientJS;
