'use strict';

import browserify from 'browserify'
import babelify from 'babelify'
import watchify from 'watchify'
import path from 'path'
import fs from 'fs'

var _defaultConfig = {
  watchify: true,
  entries: {}
}

class ClientJS {
  constructor (app) {
    this.config = Object.assign(_defaultConfig, app.config.clientjs);

    for (var entry in this.config.entries) {
      console.log("hi", entry, this.config.entries[entry]);
      this.makeBundle(entry, this.config.entries[entry]);
    }
  }

  makeBundle (entry, output) {
    var options = {
      entries: [entry],
      cache: {},
      packageCache: {},
    };
    if (this.config.watchify) {
      options.plugin = [watchify];
    }
    console.log("bundling", entry, output);
    browserify(options)
      .transform(babelify)
      .bundle()
      .pipe(fs.createWriteStream(output));
  }
}

export default ClientJS;
