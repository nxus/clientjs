/**
 * [![Build Status](https://travis-ci.org/nxus/clientjs.svg?branch=master)](https://travis-ci.org/nxus/clientjs)
 * 
 * Compacts, processes and bundles code for inclusion in the browser.  Uses browserify and babel to process source files, and makes
 * the processed file available via a static route.
 *
 * ## Installation
 *
 *     npm install nxus-clientjs --save
 * 
 * ## Configuration Options
 * 
 *     'config': {
 *       'clientjs': {
 *         'watchify': true,
 *         'routePrefix': '/url/prefix/for/generated', //optional additional prefix, defaults to ''
 *         'assetFolder': '/local/output/folder', //optional output folder, defaults to .tmp within your project directory
 *         'entries': { //manually specify static files to be created
 *           '/path/source/file.js': '/path/output/bundle.js'
 *         }
 *       }
 *     }
 *
 * ## Usage
 *
 * To use the module, there are two steps: 1) create the bundle, and 2) include/inject the source into your page.
 *
 * ### Creating the bundle
 *
 *     app.get('clientjs').bundle('/my/local/file.js', '/browser/path/to/file.js')
 *
 * ### Include/inject the source file
 *
 * You can either include the output path as specified when you creatd the bundle
 *
 *     <script source='/browser/path/to/file.js'></script>
 *
 * Or using Nxus Templater, you can inject the script by passing the output path to the `script` key on render or using the Templater 
 * lifecycle events.
 *
 *     app.get('templater').render('my-template', {scripts: ['/browser/path/to/file.js']})
 *
 * Or
 *
 *     app.get('templater').on('renderContext.my-template', () => {
 *          return {scripts: ['/browser/path/to/file.js']}
 *     })
 * 
 * ### Using ClientJS with React (or other babel transforms)
 *
 * You will need to install the necessary babel presets in your application, and add the config option `babelPresets`, like:
 *
 *     npm install --save babel-preset-es2015 babel-preset-react
 *
 *     'config': {
 *       'clientjs': {
 *         'babel': {
 *           'presets': ['es2015', 'react']
 *         }
 *       }
 *
 * # API
 * --------
 */
'use strict'

import browserify from 'browserify'
import babelify from 'babelify'
import watchify from 'watchify'
import path from 'path'
import fs from 'fs-extra'
import rc from 'rc'
import _ from 'underscore'
import morph from 'morph'

import {router} from 'nxus-router'
import {templater} from 'nxus-templater'

import {application as app, NxusModule} from 'nxus-core'

class ClientJS extends NxusModule {
  constructor () {
    super()
    this._outputPaths = {}

    if(_.isEmpty(this.config.babel)) this.config.babel = _.omit(require('rc')('babel', {}), '_', 'config', 'configs')
    this._fromConfigBundles(app)
  }

  _defaultConfig() {
    return {     
      watchify: true,
      routePrefix: '/assets/clientjs',
      assetFolder: '.tmp',
      entries: {}
    }
  }

  _fromConfigBundles (app) {
    for (var entry in this.config.entries) {
      var output = this.config.entries[entry]
      app.once('launch', () => {
        this.bundle(entry, output)
      })
    }
  }

  /**
   * Injects the passed script into to the specified template
   * @param  {String} templateName the name of the template to include the script into
   * @param  {[type]} script       the path of the script file to include
   */
  includeScript(templateName, script) {
    let outputPath = morph.toDashed(templateName)+'/script.js'
    let outputUrl = '/assets/clientjs/'+outputPath

    templater.on('renderContext.'+templateName, () => {
      return {scripts: [outputUrl]}
    })
    app.once('launch', () => {
      return this.bundle(script, outputPath)
    })
  }
  
  /**
   * Create a clientjs bundle that can be injected into a rendered page.
   * @param  {[type]} entry  the source file to bundle
   * @param  {[type]} output the output path to use in the browser to access the bundled source
   */
  bundle (entry, output) {
    this.log.debug('Bundling', entry, output)

    if(output && output[0] != '/') output = '/'+output //add prepending slash if not set
    var outputRoute = this.config.routePrefix+path.dirname(output) //combine the routePrefix with output path
    var outputPath = path.resolve(this.config.assetFolder+path.dirname(output))
    var outputFile = this.config.assetFolder+output
    var outputMap = this.config.assetFolder+output+'.map'
    var outputMapUrl = outputRoute+'/'+path.basename(output)+'.map'

    fs.mkdirsSync(outputPath) //create the local folder for output if it doesn't exist
    
    if (!(outputPath in this._outputPaths)) {
      this._outputPaths[outputPath] = true
      app.get('router').staticRoute(outputRoute, outputPath)
    }
    
    var options = {
      entries: [entry],
      cache: {},
      packageCache: {},
      debug: true
    }
    if (this.config.watchify) {
      options.plugin = [watchify]
    }
    let b = browserify(options)
      .transform(babelify.configure(this.config.babel))
      .plugin('minifyify', {map: outputMapUrl, output: outputMap})
      .on('log', (msg) => {
        this.log.debug('Bundle for', entry, msg)
      })
    let bundle = () => {
      b.bundle()
        .on('error', (err) => {
          this.log.debug('Bundle error for', entry, err)
        })
        .on('log', (msg) => {
          this.log.debug('Bundle for', entry, msg)
        })
        .pipe(fs.createWriteStream(outputFile))
    }
    b.on('update', bundle)
    bundle()
  }
}


var clientjs = ClientJS.getProxy()

export {ClientJS as default, clientjs}

