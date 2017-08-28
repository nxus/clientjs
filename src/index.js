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
 * Compacts, processes and bundles code for inclusion in the browser.  Uses browserify and babel to process source files, and makes
 * the processed file available via a static route.
 *
 * ## Installation
 *
 *     npm install nxus-clientjs --save
 * 
 * ## Configuration Options
 * 
 *       'client_js': {
 *         'babel': {}, // Babel specific options. Defaults to the project .babelrc file
 *         'routePrefix': '/assets/clientjs', // static route used to serve compiled assets
 *         'assetFolder': '.tmp/clientjs', // local dir to write compiled scripts
 *         'webcomponentsURL': 'js/wc-min.js', // URL to include for WC polyfill
 *         'reincludeComponentScripts': {} // components to ignore from babel compilation but include in scripts
 *       }
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
    this._componentCache = {}

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
   * Injects the passed script into to the specified template
   * @param  {String} templateName the name of the template to include the script into
   * @param  {[type]} script       the path of the script file to include
   */
  includeScript(templateName, script) {
    let scriptName = path.basename(script)
    let outputPath = path.join(morph.toDashed(templateName), scriptName)
    let outputUrl = path.join(this.config.routePrefix,outputPath)

    templater.on('renderContext.'+templateName, () => {
      return {scripts: [outputUrl]}
    })

    this._buildWhenReady(() => {
      return this.bundle(script, outputPath)
    })
  }

  /**
   * Injects the passed web component into to the specified template
   * @param  {String} templateName the name of the template to include the script into
   * @param  {[type]} script       the path of the component file to include
   */
  includeComponent(templateName, script) {
    let scriptName = path.basename(script)
    let outputPath = morph.toDashed(templateName) + "-" + scriptName
    let outputJS = path.join(this.config.routePrefix,outputPath)

    let imports = []
    for (let s in this.config.reincludeComponentScripts) {
      imports.push(this.config.reincludeComponentScripts[s])
    }

    templater.on('renderContext.'+templateName, () => {
      return {
        headScripts: [
          this.config.webcomponentsURL,
          outputJS
        ],
        imports
      }
    })

    this._buildWhenReady(() => {
      return this._componentize(script, outputPath)
    })
  }

  _establishRoute(route, path) {
    fs.ensureDirSync(path) //create directory if it doesn't exist
    if (!(path in this._outputPaths)) {
      this._outputPaths[path] = true
      router.staticRoute(route, path)
    }
  }

  _componentize(entry, output) {
    let outputDir = path.dirname(output)
    if (outputDir == '.') {
      outputDir = ''
    }
    var outputRoute = this.config.routePrefix+outputDir
    var outputPath = path.resolve(path.join(this.config.assetFolder, outputDir))
    var outputFilename = path.basename(output)
    var outputFile = path.join(outputPath, outputFilename)

    this._establishRoute(outputRoute, outputPath)

    if (this._componentCache[entry]) {
      let [promise, js] = this._componentCache[entry]
      return promise.then(() => {
        try {
          let fstat = fs.lstatSync(outputFile)
          if (fstat.isSymbolicLink()) fs.unlinkSync(outputFile)
        } catch (e) {
          if (e.code !== 'ENOENT') throw e
        }
        fs.copySync(js, outputFile)
      })
    }

    this.log.debug(`Componentizing: ${entry}, output-js '${outputFile}'`)

    let ignoreLinks = Object.keys(this.config.reincludeComponentScripts).map((x) => {
      return new RegExp(x+"$")
    })
    
    let options = this._webpackConfig(entry, outputPath, outputFilename)

    options.module.rules.unshift({
      test: /\.html$/,
      use: [
        {
              loader: 'babel-loader?presets=es2015',
              options: this.config.babel
        },
        {
          loader: 'polymer-webpack-loader',
          options: {
            ignoreLinks
          }
        }
      ]
    })

    let promise = new Promise((resolve, reject) => {
        webpack(options, (err, stats) => {
          if (err) {
            this.log.error(`Component bundle error for ${entry}`, err)
            reject(err)
            return
          }
          this.log.debug(`Component bundle for ${entry} written`)
          let info = stats.toJson()
          if (stats.hasErrors()) {
            this.log.error(`Component errors for ${entry}: ${info.errors}`)
            try {
              let fstat = fs.lstatSync(outputFile)
              if (fstat.isFile()) fs.unlinkSync(outputFile)
            } catch (e) {
              if (e.code !== 'ENOENT') throw e
            }
            reject(new Error(info.errors.toString()))
          }
          if (stats.hasWarnings()) {
            this.log.error(`Component warnings for ${entry}: ${info.warnings}`)
          }
          resolve()
        })
    })
    .catch((err) => {
      this.log.error("Componentize Error", err)
    })

    this._componentCache[entry] = [promise, outputFile]
    return promise
  }

  _webpackConfig(entry, outputPath, outputFilename) {

    var sourceMap = this.config.sourceMap
    
    var options = {
      entry: path.resolve(entry),
      output: {
        filename: outputFilename,
        path: outputPath,
        sourceMapFilename: outputFilename+'.map'
      },
      devtool: sourceMap ? sourceMap : false,
      watch: this.config.watchify,
      plugins: [
        new webpack.optimize.UglifyJsPlugin({
          sourceMap,
          compress: {
            warnings: false,
            drop_console: false,
          }
        })
      ],
      module: {
        rules: [
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
    return options
  }
  
  /**
   * Create a clientjs bundle that can be injected into a rendered page.
   * @param  {[type]} entry  the source file to bundle
   * @param  {[type]} output the output path to use in the browser to access the bundled source
   */
  bundle(entry, output) {
    this.log.debug('Bundling', entry, output)

    if(output && output[0] != '/') output = '/'+output //add prepending slash if not set
    var outputRoute = this.config.routePrefix+path.dirname(output) //combine the routePrefix with output path
    var outputPath = path.resolve(this.config.assetFolder+path.dirname(output))
    var outputFile = this.config.assetFolder+output
    var outputFilename = path.basename(outputFile)

    this._establishRoute(outputRoute, outputPath)

    var options = this._webpackConfig(entry, outputPath, outputFilename)
    
    let bundle = () => {
      return new Promise((resolve, reject) => {
        webpack(options, (err, stats) => {
          if (err) {
            this.log.error(`Webpack bundle error for ${entry}`, err)
            reject(err)
            return
          }
          this.log.debug(`Webpack bundle for ${entry} written`)
          let info = stats.toJson()
          if (stats.hasErrors()) {
            this.log.error(`Webpack errors for ${entry}: ${info.errors}`)
            try {
              let fstat = fs.lstatSync(outputFile)
              if (fstat.isFile()) fs.unlinkSync(outputFile)
            } catch (e) {
              if (e.code !== 'ENOENT') throw e
            }
            reject(new Error(info.errors.toString()))
          }
          if (stats.hasWarnings()) {
            this.log.error(`Webpack warnings for ${entry}: ${info.warnings}`)
          }
          resolve()
        })
      })
    }
    //b.on('update', bundle)
    return bundle()
  }

  /** Failed attempt to use polymer-build to bundle Polymer component.
   * (Left in place for now in case polymer-build eventually gets its
   * act together, and we want to try again to use it. I spent enough
   * futile effort on it that I hate to just throw it away.)
   *
   * Needs:
   *   import {PolymerProject, HtmlSplitter} from 'polymer-build'
   *   import vfs from 'vinyl-fs'
   *   import babel from 'gulp-babel'
   *   import through2 from 'through2'
   *   import ternaryStream from 'ternary-stream'
   *   import mergeStream from 'merge-stream'
   *
   * @private
   */
  _pipelineComponentize(entry, outputPath) {

    /* Code to handle scripts that are to be excluded from bundling.
      The `matchExcludedScript()` function identifies excluded scripts,
      and `excludeTransform()` is a transform stream that keeps track
      of scripts to be excluded. */
    let excludeScripts = Object.keys(this.config.reincludeComponentScripts),
        rootPath = path.dirname(path.resolve(entry)),
        excludedScripts = [],
        excludedURLs = []
    const matchExcludedScript = (data) => {
          for (let script of excludeScripts)
            if (data.path.endsWith(script)) return script
        }
    const excludeTransform = through2.obj((data, enc, callback) => {
          let script = matchExcludedScript(data)
          if (script) {
            let url = path.relative(rootPath, data.path)
            excludedScripts.push(script)
            excludedURLs.push(url)
            // TO DO: is there some way to safely zero-out content?
          }
          callback(null, data)
        })

    /* Note: Error emitted by babel seems to have these properties:
        // console.log(err.fileName + ( err.loc ? `( ${err.loc.line}, ${err.loc.column} ): ` : ': '));
        // console.log('error Babel: ' + err.message + '\n');
        // console.log(err.codeFrame);
     */
    const babelTransform = ternaryStream(
          data => (data.extname === '.js') && !matchExcludedScript(data),
          babel(this.config.babel))

    /* Hack around inability to set project root in PolymerProject.
      (However, doing this early in the pipeline seems to confuse the
      Polymer build code.) */
    const baseTransform = through2.obj((data, enc, callback) => {
          if (data.path.startsWith(root)) data.base = root
          callback(null, data)
        })

    const makeTrace = (id) => {
      let self = this
      return through2.obj((data, enc, callback) => {
        self.log.debug(`${id}: ${data.relative}`)
        callback(null, data)
      })
    }

    let root = path.resolve(path.dirname(entry)),
        entrypoint = path.basename(entry),
        project = new PolymerProject({
          root,
          entrypoint,
          sources: [ ], // suppress default
          extraDependencies: [ ]
        }),
        sourceHtmlSplitter = new HtmlSplitter(),
        dependencyHtmlSplitter = new HtmlSplitter()

    let promise = new Promise((resolve, reject) => {
      function errorHandler(err) { reject(err); this.emit('end') }

      let sourceStream = project.sources().on('error', errorHandler)
            // .pipe(baseTransform)
            .pipe(sourceHtmlSplitter.split()).on('error', errorHandler)
            .pipe(babelTransform).on('error', errorHandler)
            .pipe(sourceHtmlSplitter.rejoin()),
          dependencyStream = project.dependencies().on('error', errorHandler)
            .pipe(excludeTransform)
            // .pipe(baseTransform)
            .pipe(dependencyHtmlSplitter.split()).on('error', errorHandler)
            .pipe(babelTransform).on('error', errorHandler)
            .pipe(dependencyHtmlSplitter.rejoin())

      mergeStream(sourceStream, dependencyStream)
        .pipe(project.bundler({excludes: excludedURLs}))
        .pipe(vfs.dest(outputPath, { cwd: root }))
        .on('end', resolve)
    }).catch((err) => {
      this.log.error("Componentize Error", err)
    })

    return promise
  }

}


var clientjs = ClientJS.getProxy()

export {ClientJS as default, clientjs}

