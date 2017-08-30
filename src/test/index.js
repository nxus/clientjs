/* globals before: false, beforeEach: false, describe: false, it: false */

'use strict'

import fs from 'fs'
import path from 'path'
import Promise from 'bluebird'

import ClientJS, {clientjs as clientjsProxy} from '../'

import sinon from 'sinon'

import {application as app} from 'nxus-core'
import {router} from 'nxus-router'
import {templater} from 'nxus-templater'

const configBabel = { presets: [ 'es2015' ] }
const configEntries = {
  'src/test/apps/one.js': 'test/apps/one-bundled.js', // (in .tmp/clientjs/)
  'src/test/apps/two.js': 'test/apps/two-bundled.js'  // (in .tmp/clientjs/)
}
const scriptEntries = {
  'src/test/apps/one.js': 'my-template/one.js' // (in .tmp/clientjs/)
}
const componentEntries = {
  'src/test/apps/component-one.html': 'component-one.html.js' // (in .tmp/clientjs/)
}

const defaultConfig = { babel: configBabel, sourceMap: 'source-map'}

/* Create a new ClientJS instance.
 * First initialize the application `client_js` configuration, so it has
 * well-known settings for the instance.
 */
function makeClientJS(config) {
  app.config['client_js'] = Object.assign(defaultConfig, app.config['client_js'], config)
  // if (config) app.config['client_js'] = Object.assign({}, app.config['client_js'], config)
  return new ClientJS()
}

/* Emits lifecycle event.
 * Returns a promise that can be used to wait until after event.
 */
function emitLifecycleEvent(event) {
  app.emit(event)
  return new Promise((resolve, reject) => {
    app.onceAfter(event, (results) => { resolve() })
  })
}


function trimExt(p) {
  return p.substring(0, p.length - path.posix.extname(p).length)
}

/* Clear output data.
 */
function clearOutputData(out, exts) {
  let root = trimExt(path.posix.resolve('.tmp/clientjs', out))
  for (let ext of exts) {
    try {
      fs.unlinkSync(root + ext)
    } catch (e) {}
  }
}

/* Loads reference data.
 */
function loadReferenceData(entries, ref, exts) {
  let refs = {}
  for (let key in entries) {
    let root = trimExt(path.posix.resolve(ref, path.posix.basename(entries[key])))
    refs[key] = {}
    for (let ext of exts) {
      try { refs[key][ext] = fs.readFileSync(root + ext, 'utf8') } catch (e) {}
    }
  }
  return refs
}

/* Compares reference data.
 */
function compareReferenceData(refs, out) {
  let root = trimExt(path.posix.resolve('.tmp/clientjs', out))
  for (let ext in refs) {
    let data = fs.readFileSync(root + ext, 'utf8')
    expect(data).to.equal(refs[ext])
  }
}


describe('ClientJS', function () {
  var configRefs = loadReferenceData(configEntries, 'src/test/data/bundle/', [ '.js', '.js.map' ]),
      scriptRefs = loadReferenceData(scriptEntries, 'src/test/data/script/', [ '.js', '.js.map' ]),
      componentRefs = loadReferenceData(componentEntries, 'src/test/data/component/', [ '.html' ]),
      clientjs

  this.timeout(5000)

  before(() => {
    sinon.spy(app, 'once')
    sinon.spy(app, 'onceAfter')
    sinon.spy(clientjsProxy, 'respond')
    sinon.spy(clientjsProxy, 'request')
    sinon.spy(templater, 'on')
    router.staticRoute = sinon.spy()
  })

  describe('Load', () => {
    it('should not be null', () => {
      expect(ClientJS).to.not.be.null
      expect(clientjsProxy).to.not.be.null
    })
  })

  describe('Init', () => {
    before(() => {
      router.staticRoute.reset()
      for (let entry in configEntries)
        clearOutputData(configEntries[entry], Object.keys(configRefs[entry]))
      clientjs = makeClientJS({entries: configEntries})
      emitLifecycleEvent('launch')
      return Promise.delay(2000)
        // there's no way to await completion of the build, so we just delay for a while
    })

    it('should be instantiated', () => {
      expect(clientjs).to.not.be.null
    })

    it('should have the config', () => {
      expect(clientjs.config.entries).to.exist
      clientjs.config.entries.should.deep.equal(configEntries)
    })

    it('should use the application client_js config', () => {
      expect(clientjs.config.babel).to.exist
      clientjs.config.babel.should.deep.equal(configBabel)
    })

    it('should provide asset routes', ()=> {
      router.staticRoute.calledWith('/assets/clientjs/test/apps').should.be.true
    })

    it('should create config bundles', () => {
      for (let entry in configEntries)
        compareReferenceData(configRefs[entry], configEntries[entry])
    })
  })

  describe('Bundle', () => {
    let entry = Object.keys(configEntries)[0],
        output = configEntries[entry]

    before(() => {
      clientjs = makeClientJS()
      emitLifecycleEvent('launch')
      return Promise.delay(2000)
        // there's no way to await completion of the build, so we just delay for a while
      .then(() => {
        // initialize after config builds have taken place
        clearOutputData(output, Object.keys(configRefs[entry]))
        return clientjs.bundle(entry, output)
      })
    })

    it('should create bundle one', () => {
      compareReferenceData(configRefs[entry], output)
    })
  })

  describe('Bundle Missing Entry', () => {
    let entry = 'src/test/apps/missing.js',
        output = 'test/apps/missing-bundled.js'

    it('should reject with error', () => {
      return clientjs.bundle(entry, output).should.be.rejectedWith(Error)
    })
    it('should not create bundle', () => {
      let p = path.posix.resolve('.tmp/clientjs', output)
      expect(fs.existsSync(p)).to.be.false
    })
  })

  describe('Bundle Invalid Entry', () => {
    let entry = 'src/test/apps/invalid.js',
        output = 'test/apps/invalid-bundled.js'

    it('should reject with error', () => {
      return clientjs.bundle(entry, output).should.be.rejectedWith(Error)
    })
    it('should not create bundle', () => {
      let p = path.posix.resolve('.tmp/clientjs', output)
      expect(fs.existsSync(p)).to.be.false
    })
  })

  describe('Include Script', () => {
    let entry = Object.keys(scriptEntries)[0],
        output = scriptEntries[entry]

    before(() => {
      templater.on.reset()
      router.staticRoute.reset()
      clearOutputData(output, Object.keys(scriptRefs[entry]))
      clientjs = makeClientJS()
      clientjs.includeScript('my-template', entry)
      emitLifecycleEvent('launch')
      return clientjs.readyToBuild // await completion of build (so we can check results)
    })

    it('should call templater.on() and router.staticRoute()', ()=> {
      templater.on.calledWith('renderContext.my-template').should.be.true
      router.staticRoute.calledWith('/assets/clientjs/my-template').should.be.true
    })

    it('should create bundle one', () => {
      compareReferenceData(scriptRefs[entry], output)
    })
  })

  describe('Include Component', () => {
    let entry = Object.keys(componentEntries)[0],
        templates = [ 'my-template1', 'my-template2' ],
        outputs = templates.map(t => `${t}-${componentEntries[entry]}`)

    const config = {
      minify: false, // FIXME Uglify is failing on this component, so skipping for test
      reincludeComponentScripts: {
        'polymer/polymer.html': '/js-deps/polymer/polymer.html' } }

    before(() => {
      templater.on.reset()
      for (let output of outputs)
        clearOutputData(output, Object.keys(componentRefs[entry]))
      clientjs = makeClientJS(config)
      for (let template of templates)
        clientjs.includeComponent(template, entry)
      emitLifecycleEvent('launch')
      return clientjs.readyToBuild // await completion of build (so we can check results)
    })

    it('should call templater.on()', ()=> {
      for (let template of templates)
        templater.on.calledWith(`renderContext.${template}`).should.be.true
    })

    it('should create transformed component', () => {
      for (let output of outputs)
        compareReferenceData(componentRefs[entry], output)
    })
  })

  describe('Include Invalid Component', () => {
    let entry = 'src/test/apps/component-invalid.html',
        output = 'my-template-component-invalid.html'

    before(() => {
      clientjs = makeClientJS({})
      clientjs.includeComponent('my-template', entry)
      emitLifecycleEvent('launch')
      return clientjs.readyToBuild // await completion of build (so we can check results)
    })

    it('should not create transformed component', () => {
      let p = path.posix.resolve('.tmp/clientjs', output)
      expect(fs.existsSync(p)).to.be.false
    })
  })


})
