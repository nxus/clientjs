'use strict'

import Promise from 'bluebird'
import webpack from 'webpack'
import path from 'path'
import fs from 'fs-extra'
import _ from 'underscore'
import traverse from 'traverse'

const {router} = require('nxus-router')
const {templater} = require('nxus-templater')

import {application as app, NxusModule} from 'nxus-core'

const mkdirp = require('mkdirp')

/**
 *
 * [![Build Status](https://travis-ci.org/nxus/clientjs.svg?branch=master)](https://travis-ci.org/nxus/clientjs)
 *
 *
 * Compacts, processes and bundles code for inclusion in the browser. Uses webpack and babel to process source files, and makes
 * the processed file available via a static route.
 *
 * ## Installation
 *
 *     npm install nxus-clientjs --save
 *
 * ## Configuration Options
 *
 *       'client_js': {
 *         'babel': {}, // Babel specific options
 *         'watchify': true, // Whether to have webpack watch for changes
 *         'minify': true, // Whether to have webpack minify output
 *         'sourceMap': 'source-map', // Sourcemap devtool option for webpack
 *         'webpackConfig': {}, // Additional webpack config, merged with default
 *         'appendRulesConfig': false, // should webpack config rules be merged or replace the default
 *         'routePrefix': '/assets/clientjs', // static route used to serve compiled assets
 *         'assetFolder': '.tmp/clientjs', // local dir to write compiled scripts
 *         'webcomponentsURL': '/js/webcomponentsjs/webcomponents-lite.min.js', // URL for WC polyfill
 *         'buildNone': false, // For production, to skip any bundling if pre-building during deploy
 *         'buildOnly': false, // For building during deploy scripts
 *         'buildSeries': false // Whether to run bundle builds in series instead of parallel, for deploy scripts
 *       }
 *
 * ## Usage
 *
 * ClientJS supports bundling scripts using webpack and processing them with babel.
 * The resulting file is served from a temporary location with the necessary script tags inserted for a given template.
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
 * The bundle will be accessible at the route prefix + output path in your browser.
 *
 * You can include the script in your template either manually:
 *
 *     <script src='/assets/clientjs/path/to/file.js'></script>
 *
 * Or using Nxus Templater:
 *
 *     app.get('templater').render('my-template', {scripts: ['/assets/clientjs/path/to/file.js']})
 *
 * Or
 *
 *     app.get('templater').on('renderContext.my-template', () => {
 *          return {scripts: ['/assets/clientjs/path/to/file.js']}
 *     })
 *
 * ### Using ClientJS with Babel
 *
 * The default configuration includes babel-loader with @babel/preset-env.
 * You can customize the Babel configuration through the webpackConfig option.
 */
class ClientJS extends NxusModule {
  constructor () {
    super()
    this._outputPaths = {}
    this._establishedRoutes = {}

    this._builders = []
    const readyToBuild = new Promise((resolve, reject) => {
      app.on('launch', () => {
        resolve()
      })
    }).then(this._buildingWhenReady.bind(this))
    if (this.config.buildOnly) {
      readyToBuild.then(app.stop.bind(app)).then(process.exit.bind(process))
    } else {
      this._establishRoute(this.config.routePrefix, this.config.assetFolder)
    }
  }

  _defaultConfig() {
    return {
      watchify: true,
      minify: app.config.NODE_ENV === 'production',
      webpackConfig: {},
      appendRulesConfig: false,
      routePrefix: '/assets/clientjs',
      assetFolder: '.tmp/clientjs',
      webcomponentsURL: '/js/webcomponentsjs/webcomponents-lite.min.js',
      entries: {},
      sourceMap: app.config.NODE_ENV !== 'production' ? 'source-map' : false,
      buildSeries: false,
      buildOnly: false,
      buildNone: false
    }
  }

  _fromConfigBundles(app) {
    for (let entry in this.config.entries) {
      let output = this.config.entries[entry]
      app.once('launch', () => this.bundle(entry, output))
    }
  }

  _buildWhenReady(builder) {
    this._builders.push(builder)
  }

  _buildingWhenReady() {
    if (this.config.buildNone) return
    const op = this.config.buildSeries ? Promise.mapSeries : Promise.map
    return op(this._builders, (x) => x())
  }

  /**
   * Injects the passed script entry into to the specified template after webpack/babel
   * @param  {String} templateName the name of the template to include the script into
   * @param  {[type]} script       the path of the script file to include
   */
  includeScript(templateName, script) {
    const scriptName = path.basename(script)
    let outputPath = scriptName

    const scripts = [path.join(this.config.routePrefix,outputPath)]

    templater.on('renderContext.'+templateName, () => ({
      headScripts: [],
      scripts,
      imports: []
    }))

    this._buildWhenReady(() => this.bundle(script, outputPath))
  }

  _establishRoute(route, path) {
    if (!(route in this._establishedRoutes)) {
      fs.ensureDirSync(path) // create directory if it doesn't exist
      router.staticRoute(route, path)
      this._establishedRoutes[route] = path
    }
  }

  _webpackConfig(entry, outputPath, outputFilename) {
    const opts = {
      rootDir: process.cwd(),
      devBuild: process.env.NODE_ENV !== 'production',
      outputFilename
    }

    mkdirp.sync(path.join(opts.rootDir, '.tmp/cache'))
    const sourceMap = this.config.sourceMap

    let options = {
      entry: path.resolve(entry),
      output: {
        filename: outputFilename,
        path: outputPath
      },
      mode: app.config.NODE_ENV,
      devtool: sourceMap ? (typeof sourceMap === 'string' ? sourceMap : 'source-map') : false,
      watch: this.config.watchify,
      resolve: {
        modules: [
          "node_modules",
          "bower_components"
        ],
        descriptionFiles: [
          "package.json",
          "bower.json"
        ],
        extensions: ['.js', '.jsx', '.ts', '.tsx', '.json']
      },
      module: {
        rules: [
          {
            test: /\.(js|jsx)$/,
            exclude: /(node_modules|bower_components)/,
            use: {
              loader: 'babel-loader',
              options: { 
                presets: ['@babel/preset-env', '@babel/preset-react']
              }
            }
          },
          {
            test: /\.(ts|tsx)$/,
            exclude: /(node_modules|bower_components)/,
            use: {
              loader: 'babel-loader',
              options: { 
                presets: ['@babel/preset-env', '@babel/preset-typescript', '@babel/preset-react']
              }
            }
          },
          {
            test: /\.css$/,
            use: ['style-loader', 'css-loader']
          }
        ]
      },
      optimization: {
        minimize: this.config.minify,
      }
    }

    if (this.config.webpackConfig) {
      const localConfig = Object.assign({}, this.config.webpackConfig)
      // hydrate regexps from json config
      traverse(localConfig).forEach(function(n) {
        if (_.isString(n) && n.substring(0,1) == "/" && n.substring(-1, 1) == "/") {
          this.update(new RegExp(n.substring(1, n.length-1)))
        }
      })
      // special case module.rules update
      const moduleConfig = {}
      if (this.config.appendRulesConfig && localConfig.module && localConfig.module.rules) {
        moduleConfig.module = {rules: localConfig.module.rules.concat(options.module.rules)}
      }
      options = Object.assign(options, localConfig, moduleConfig)
    }

    options.cache = {
      type: 'filesystem',
      buildDependencies: {
        config: [__filename],
      },
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

    const outputDir = path.dirname(output)
    if (outputDir === '.') {
      // outputDir = '' // This line seems unnecessary based on the original logic.
    }

    if(output && output[0] !== '/') output = '/'+output //add prepending slash if not set
    const outputRoute = this.config.routePrefix+path.dirname(output) //combine the routePrefix with output path
    const outputPath = path.resolve(this.config.assetFolder+path.dirname(output))
    const outputFile = this.config.assetFolder+output
    const outputFilename = path.basename(outputFile)

    let promise = this._outputPaths[outputFile]
    if (!promise) {
      promise = new Promise((resolve, reject) => {
        const options = this._webpackConfig(entry, outputPath, outputFilename)
        webpack(options, (err, stats) => {
          if (err) {
            this.log.error(`Bundle error for ${entry}`, err)
            reject(err)
            return
          }
          const info = stats.toJson()
          if (stats.hasErrors()) {
            const errorDetails = info.errors.map(error => {
              return {
                message: error.message,
                moduleName: error.moduleName,
                loc: error.loc
              }
            });
            this.log.error(`Bundle errors for ${entry}:`, JSON.stringify(errorDetails, null, 2));
            try {
              const fstat = fs.lstatSync(outputFile)
              if (fstat.isFile()) fs.unlinkSync(outputFile)
            } catch (e) {
              if (e.code !== 'ENOENT') throw e
            }
            reject(new Error(JSON.stringify(errorDetails, null, 2)))
            return
          }
          if (stats.hasWarnings()) {
            const warningDetails = info.warnings.map(warning => {
              return {
                message: warning.message,
                moduleName: warning.moduleName,
                loc: warning.loc
              }
            });
            this.log.error(`Bundle warnings for ${entry}:`, JSON.stringify(warningDetails, null, 2));
          }
          this.log.debug(`Bundle for ${entry} written to ${outputFile}`)
          resolve()
        })
      })
      this._establishRoute(outputRoute, outputPath)
      this._outputPaths[outputFile] = promise

    }
    return promise
  }
}


var clientjs = ClientJS.getProxy()

export {ClientJS as default, clientjs}
