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
 */
'use strict';

import browserify from 'browserify'
import babelify from 'babelify'
import watchify from 'watchify'
import path from 'path'
import fs from 'fs'

var _defaultConfig = {
  watchify: true,
  assetPrefix: '/clientjs',
  entries: {}
}

class ClientJS {
  constructor (app) {
    this.app = app
    this.config = Object.assign(_defaultConfig, app.config.clientjs)

    this.app.get('clientjs').use(this)
      .gather('bundle')
    this.fromConfigBundles(app);
  }

  fromConfigBundles (app) {
    
    var output_dirs = {};
    for (var entry in this.config.entries) {
      var output = this.config.entries[entry];
      var output_dir = path.dirname(output);

      if (!(output_dir in output_dirs)) {
        output_dirs[output_dir] = true;
        this.app.get('router').setStatic(path.join(this.config.assetPrefix, output_dir), path.resolve(output_dir));
      }

      this.app.get('clientjs').bundle(entry, output);
    }
  }
  
  bundle (entry, output) {
    var options = {
      entries: [entry],
      cache: {},
      packageCache: {},
    };
    if (this.config.watchify) {
      options.plugin = [watchify];
    }
    browserify(options)
      .transform(babelify)
      .bundle()
      .pipe(fs.createWriteStream(output));
  }
}

export default ClientJS;
