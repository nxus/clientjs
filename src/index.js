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
 *         "routePrefix": "/url/prefix/for/generated"
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
 * # API
 * --------
 */
'use strict';

import browserify from 'browserify'
import babelify from 'babelify'
import watchify from 'watchify'
import path from 'path'
import fs from 'fs-extra'

var _defaultConfig = {
  watchify: true,
  routePrefix: '',
  assetFolder: '.tmp',
  babel: {},
  entries: {}
}

class ClientJS {
  constructor (app) {
    this.app = app
    this.config = Object.assign(_defaultConfig, app.config.clientjs)
    this.output_paths = {}
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
  
  /**
   * Create a clientjs bundle that can be injected into a rendered page.
   * @param  {[type]} entry  [description]
   * @param  {[type]} output [description]
   * @return {[type]}        [description]
   */
  bundle (entry, output) {
    this.app.log.debug('Bundling', entry, output)

    if(output && output[0] != '/') output = "/"+output //add prepending slash if not set
    
    var output_route = this.config.routePrefix+path.dirname(output); //combine the routePrefix with output path
    var output_path = path.resolve(this.config.assetFolder+path.dirname(output));
    var output_file = this.config.assetFolder+output;
    
    fs.mkdirsSync(output_path) //create the local folder for output if it doesn't exist
    
    if (!(output_path in this.output_paths)) {
      this.output_paths[output_path] = true;
      this.app.get('router').setStatic(output_route, output_path);
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
        this.app.log.debug("Bundle for", output_file, msg)
      })
    let bundle = () => {
      b.bundle()
        .on("error", (err) => {
          this.app.log.debug("Bundle error for", output_file, err)
        })
        .pipe(fs.createWriteStream(output_file));
    }
    b.on("update", bundle)
    bundle()
  }
}

export default ClientJS;
