'use strict'

import Promise from 'bluebird'
import webpack from 'webpack'
import path from 'path'
import fs from 'fs-extra'
import _ from 'underscore'
import morph from 'morph'

import Vulcanize from 'vulcanize'
import crisper from 'crisper'
import * as babel from 'babel-core'
import * as parse5 from 'parse5'
import * as dom5 from 'dom5'

import {router} from 'nxus-router'
import {templater} from 'nxus-templater'

import {application as app, NxusModule} from 'nxus-core'

/**
 *
 * [![Build Status](https://travis-ci.org/nxus/clientjs.svg?branch=master)](https://travis-ci.org/nxus/clientjs)
 * 
 * 
 * Compacts, processes and bundles code for inclusion in the browser.  Uses webpack and babel to process source files, and makes
 * the processed file available via a static route.
 *
 * ## Installation
 *
 *     npm install nxus-clientjs --save
 * 
 * ## Configuration Options
 * 
 *       'client_js': {
 *         'babel': {}, // Babel specific options. Defaults to the project .babelrc file options
 *         'watchify': true, // Whether to have webpack watch for changes - add your js to .nxusrc 'ignore' if so
 *         'minify': true, // Whether to have webpack minify output
 *         'webpackConfig': {}, // Additional webpack config, merged with default.
 *         'routePrefix': '/assets/clientjs', // static route used to serve compiled assets
 *         'assetFolder': '.tmp/clientjs', // local dir to write compiled scripts
 *         'webcomponentsURL': 'js/wc-min.js', // URL to include for WC polyfill
 *         'reincludeComponentScripts': {}, // components to ignore from babel compilation but include in scripts
 *         'buildNone': false, // For production, to skip any bundling if pre-building during deploy
 *         'buildOnly': false, // For building during deploy scripts
 *         'buildSeries': false // Whether to run bundle builds in series instead of parallel, for deploy scripts 
 *       }
 *
 * ## Usage
 *
 * ClientJS currently supports bundling scripts from a JS file entry point or Polymer web components
 * HTML file entry point using webpack. Both options will serve the resulting file from a temporary location
 * and process the results using babel if configured, and insert the necessary script tags for a given template.
 *
 *     app.get('clientjs').includeScript('my-template', __dirname+"/js/entry.js")
 *
 *
 * ### Creating a bundle for manual inclusion in a template
 *
 * These are the low-level steps that `includeScript` performs:
 *
 *     app.get('clientjs').bundle('/my/local/file.js', '/path/to/serve/file.js')
 *
 * Serve the bundled path using `router.staticRoute`:
 *
 *     app.get('router').staticRoute('/browser/path/to', '/path/to/serve')
 *
 * Then include/inject the source file:
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
 * ### Using ClientJS with Babel transforms
 *
 * You will need to install the necessary Babel presets and plugins
 * in your application, and add Babel configuration options to the
 * `clientjs` section of your `.nxusrc` file. For example:
 *
 * ```javascript
 *     npm install --save babel-preset-es2015 \
 *       babel-plugin-transform-function-bind \
 *       babel-plugin-transform-object-rest-spread
 * ```
 *
 * ```
 *     "client_js": {
 *         ...
 *       "babel": {
 *         "presets": [ "es2015" ],
 *         "plugins": [
 *           "transform-function-bind",
 *           "transform-object-rest-spread"
 *         ]
 *       }
 *     }
 * ```
 */
class ClientJS extends NxusModule {
  constructor () {
    super()
    this._outputPaths = {}

    if(_.isEmpty(this.config.babel))
      this.config.babel = _.omit(require('rc')('babel', {}, {}), '_', 'config', 'configs')
    this._fromConfigBundles(app)

    this._builders = []
    this.readyToBuild = new Promise((resolve, reject) => {
      app.on('launch', () => {
        resolve()
      })
    }).then(::this._buildingWhenReady)
    if (this.config.buildOnly) {
      this.readyToBuild.then(::app.stop).then(::process.exit)
    } else {
      this._establishRoute(this.config.routePrefix, this.config.assetFolder)
    }
  }

  _defaultConfig() {
    return {     
      watchify: true,
      minify: true,
      webpackConfig: {},
      routePrefix: '/assets/clientjs',
      assetFolder: '.tmp/clientjs',
      webcomponentsURL: '/js/webcomponentsjs/webcomponents-lite.min.js',
      reincludeComponentScripts: {},
      entries: {},
      sourceMap: app.config.NODE_ENV != 'production' ? 'cheap-module-eval-source-map' : 'source-map',
      buildSeries: false,
      buildOnly: false,
      buildNone: false
    }
  }

  _fromConfigBundles(app) {
    for (let entry in this.config.entries) {
      let output = this.config.entries[entry]
      app.once('launch', () => {
        this.bundle(entry, output)
      })
    }
  }

  _buildWhenReady(builder) {
    this._builders.push(builder)
  }

  _buildingWhenReady() {
    if (this.config.buildNone) return
    let op = this.config.buildSeries ? Promise.mapSeries : Promise.map
    return op(this._builders, (x) => {return x()})
  }

  /**
   * Injects the passed script entry into to the specified template after webpack/babel
   * @param  {String} templateName the name of the template to include the script into
   * @param  {[type]} script       the path of the script file to include
   */
  includeScript(templateName, script) {
    let scriptName = path.basename(script)
    let outputPath = path.join(morph.toDashed(templateName), scriptName)
    let outputUrl = path.join(this.config.routePrefix,outputPath)

    let imports, scripts, headScripts

    if (script.slice(-4) == 'html') {
      outputPath += ".js"
      imports = []
      for (let s in this.config.reincludeComponentScripts) {
        imports.push(this.config.reincludeComponentScripts[s])
      }
      headScripts = [
        this.config.webcomponentsURL,
      ]
      scripts = [outputUrl]
    } else {
      scripts = [outputUrl]
    }

    templater.on('renderContext.'+templateName, () => {
      return {
        headScripts,
        scripts,
        imports
      }
    })
    
    this._buildWhenReady(() => {
      return this.bundle(script, outputPath)
    })
  }

  /**
   * @deprecated
   * (Deprecated, includeScript now handles this.) Injects the passed web component entry into to the specified template after bundling/babel
   * @param  {String} templateName the name of the template to include the script into
   * @param  {[type]} script       the path of the component file to include
   */
  includeComponent(templateName, script) {
    return this.includeScript(templateName, script)
  }

  _establishRoute(route, path) {
    fs.ensureDirSync(path) //create directory if it doesn't exist
    if (!(path in this._outputPaths)) {
      this._outputPaths[path] = true
      router.staticRoute(route, path)
    }
  }

  _webpackConfig(entry, outputPath, outputFilename) {

    var sourceMap = this.config.sourceMap
    
    let ignoreLinks = Object.keys(this.config.reincludeComponentScripts).map((x) => {
      return new RegExp(x+"$")
    })
    
    var options = {
      entry: path.resolve(entry),
      output: {
        filename: outputFilename,
        path: outputPath,
        sourceMapFilename: outputFilename+'.map'
      },
      devtool: sourceMap ? sourceMap : false,
      watch: this.config.watchify,
      module: {
        rules: [
          {
            test: /\.html$/,
            use: [
              {
                loader: 'babel-loader',
                options: this.config.babel
              },
              {
                loader: 'polymer-webpack-loader',
                options: {
                  ignoreLinks,
                  htmlLoader: {
                    minimize: false
                  }
                }
              }
            ]
          },
          {
            test: /\.js$/,
            exclude: /(node_modules|bower_components)/,
            use: {
              loader: 'babel-loader',
              options: this.config.babel
            }
          }
        ]
      }
    }
    if (this.config.minify) {
      options.plugins = [
        new webpack.optimize.UglifyJsPlugin({
          sourceMap,
          compress: {
            warnings: false,
            drop_console: false,
          }
        })
      ]
    }
    if (this.config.webpackConfig) {
      options = Object.assign(options, this.config.webpackConfig)
    }
    return options
  }
  
  /**
   * Create a clientjs bundle that can be injected into a rendered page.
   * @param  {[type]} entry  the source file to bundle
   * @param  {[type]} output the output path to use in the browser to access the bundled source
   */
  bundle(entry, output) {
    this.log.debug('Bundling', entry, "to", output)
    
    let outputDir = path.dirname(output)
    if (outputDir == '.') {
      outputDir = ''
    }

    if(output && output[0] != '/') output = '/'+output //add prepending slash if not set
    var outputRoute = this.config.routePrefix+path.dirname(output) //combine the routePrefix with output path
    var outputPath = path.resolve(this.config.assetFolder+path.dirname(output))
    var outputFile = this.config.assetFolder+output
    var outputFilename = path.basename(outputFile)

    this._establishRoute(outputRoute, outputPath)

    var options = this._webpackConfig(entry, outputPath, outputFilename)
    
    let promise = new Promise((resolve, reject) => {
        webpack(options, (err, stats) => {
          if (err) {
            this.log.error(`Bundle error for ${entry}`, err)
            reject(err)
            return
          }
          let info = stats.toJson()
          if (stats.hasErrors()) {
            this.log.error(`Bundle errors for ${entry}: ${info.errors}`)
            try {
              let fstat = fs.lstatSync(outputFile)
              if (fstat.isFile()) fs.unlinkSync(outputFile)
            } catch (e) {
              if (e.code !== 'ENOENT') throw e
            }
            reject(new Error(info.errors.toString()))
            return
          }
          if (stats.hasWarnings()) {
            this.log.error(`Bundle warnings for ${entry}: ${info.warnings}`)
          }
          this.log.debug(`Bundle for ${entry} written to ${outputFile}`)
          resolve()
        })
    })

    return promise
  }

}


var clientjs = ClientJS.getProxy()

export {ClientJS as default, clientjs}

