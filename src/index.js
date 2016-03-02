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
import reactify from 'reactify'
import watchify from 'watchify'
import path from 'path'
import fs from 'fs'

var _defaultConfig = {
  watchify: true,
  assetPrefix: '/clientjs/',
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
    browserify(options)
      .transform(reactify)
      .transform(babelify)
      .bundle()
      .pipe(fs.createWriteStream(output));
  }
}

export default ClientJS;
