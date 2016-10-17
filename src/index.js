'use strict'

import Promise from 'bluebird'
import browserify from 'browserify'
import babelify from 'babelify'
import watchify from 'watchify'
import path from 'path'
import child_process_ from 'child_process'
let child_process = Promise.promisifyAll(child_process_)
import fs from 'fs-extra'
import rc from 'rc'
import _ from 'underscore'
import morph from 'morph'

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
 *       'clientjs': {
 *         'babel': {} // Babel specific options. Defaults to the project .babelrc file
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
 * ### Using ClientJS with React (or other babel transforms)
 *
 * You will need to install the necessary babel presets in your application, and add the config option `babelPresets`, like:
 *
 * ```javascript
 *     npm install --save babel-preset-es2015 babel-preset-react
 * ```
 *
 * ```
 *       'clientjs': {
 *         'babel': {
 *           'presets': ['es2015', 'react']
 *         }
 * ```
 */
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
      assetFolder: '.tmp/clientjs',
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
    let scriptName = path.basename(script)
    let outputPath = path.join(morph.toDashed(templateName), scriptName)
    let outputUrl = path.join(this.config.routePrefix,outputPath)

    templater.on('renderContext.'+templateName, () => {
      return {scripts: [outputUrl]}
    })

    app.once('launch', () => {
      return this.bundle(script, outputPath)
    })
  }

  /**
   * Injects the passed web component into to the specified template
   * @param  {String} templateName the name of the template to include the script into
   * @param  {[type]} script       the path of the component file to include
   */
  includeComponent(templateName, script, webcomponentsURL="/js/webcomponentsjs/webcomponents-lite.min.js") {
    let scriptName = path.basename(script)
    let outputPath = morph.toDashed(templateName) + "-" + scriptName
    let outputHTML = path.join(this.config.routePrefix,outputPath)
    let outputJS = outputHTML+".js"

    templater.on('renderContext.'+templateName, () => {
      return {
        headScripts: [webcomponentsURL, outputJS],
        imports: [outputHTML]
      }
    })

    app.once('launch', () => {
      return this.componentize(script, outputPath)
    })
  }

  componentize(entry, outputHTML) {
    let outputHTMLDir = path.dirname(outputHTML)
    if (outputHTMLDir == '.') {
      outputHTMLDir = ''
    }
    var outputRoute = this.config.routePrefix+outputHTMLDir
    var outputPath = path.resolve(path.join(this.config.assetFolder, outputHTMLDir))
    var outputFile = path.join(outputPath, path.basename(outputHTML))
    let outputJS = outputFile+".js"

    if (!(outputPath in this._outputPaths)) {
      this._outputPaths[outputPath] = true
      router.staticRoute(outputRoute, outputPath)
    }
    
    let cmd = "vulcanize " + entry + " --inline-script --inline-html"
    cmd += " | crisper --html " + outputFile + " --js " + outputJS
    this.log.debug("Componentizing:", cmd)
    child_process.execAsync(cmd).then((error, stdout, stderr) => {
      if (error) this.log.error("Componentize Error", error)
//      this.request("bundle", outputJS, path.basename(outputJS))
    }).catch((e) => {
      this.log.error("Componentize Error", e)
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
      router.staticRoute(outputRoute, outputPath)
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
          this.log.error('Bundle error for', entry, err)
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

