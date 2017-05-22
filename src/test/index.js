/* globals before: false, beforeEach: false, describe: false, it: false */

'use strict'

import fs from 'fs'
import path from 'path'

import ClientJS, {clientjs as clientjsProxy} from '../'

import sinon from 'sinon'

import {application as app} from 'nxus-core'
import {router} from 'nxus-router'
import {templater} from 'nxus-templater'

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
chai.use(chaiAsPromised)
let should = chai.should(),
    expect = chai.expect

const configBabel = { presets: [ 'es2015' ] }
const configEntries = {
  'src/test/apps/one.js': 'test/apps/one-bundled.js', // (in .tmp/clientjs/)
  'src/test/apps/two.js': 'test/apps/two-bundled.js'  // (in .tmp/clientjs/)
}
const scriptEntries = {
  'src/test/apps/one.js': 'my-template/one.js' // (in .tmp/clientjs/)
}
const componentEntries = {
  'src/test/apps/three.html': 'my-template-three.html' // (in .tmp/clientjs/)
}


/* Create a new ClientJS instance.
 * First initialize the application `client_js` configuration, so it has
 * well-known settings for the instance.
 */
function makeClientJS(config) {
  app.config['client_js'] = Object.assign({ babel: configBabel}, app.config['client_js'], config)
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


describe('ClientJS', () => {
  var configRefs = loadReferenceData(configEntries, 'src/test/data/bundle/', [ '.js', '.js.map' ]),
      scriptRefs = loadReferenceData(scriptEntries, 'src/test/data/script/', [ '.js', '.js.map' ]),
      componentRefs = loadReferenceData(componentEntries, 'src/test/data/component/', [ '.html', '.html.js' ]),
      clientjs

  before(() => {
    sinon.spy(app, 'once')
    sinon.spy(app, 'onceAfter')
    sinon.spy(clientjsProxy, 'respond')
    sinon.spy(clientjsProxy, 'request')
    sinon.spy(templater, 'on')
    router.staticRoute = sinon.spy()
  })

  describe('Load', () => {
    it('should not be null', () => ClientJS.should.not.be.null)

    it('should not be null', () => {
      ClientJS.should.not.be.null
      clientjsProxy.should.not.be.null
    })

    it('should be instantiated', () => {
      clientjs = makeClientJS()
      clientjs.should.not.be.null
    })
  })

  describe('Init', () => {
    beforeEach(() => {
      clientjs = makeClientJS({entries: configEntries})
    })

    it('should have the config', () => {
      should.exist(clientjs.config.entries)
      for (let key in configEntries)
        clientjs.config.entries.should.have.property(key, configEntries[key])
    })

    it('should use the application client_js config', () => {
      should.exist(clientjs.config.babel)
      clientjs.config.babel.should.have.property('presets')
    })
  })

  describe('Bundle', () => {
    let entry = Object.keys(configEntries)[0],
        output = configEntries[entry]

    before(() => {
      router.staticRoute.reset()
    })

    beforeEach(() => {
      clearOutputData(output, Object.keys(configRefs[entry]))
      clientjs = makeClientJS()
      return clientjs.bundle(entry, output)
    })

    it('should create bundle one', () => {
      compareReferenceData(configRefs[entry], output)
    })

    it('should provide asset routes', (done)=> {
      router.staticRoute.calledWith('/assets/clientjs/test/apps').should.be.true
      done()
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

    it('should call templater and render', ()=> {
      templater.on.calledWith('renderContext.my-template').should.be.true
      router.staticRoute.calledWith('/assets/clientjs/my-template').should.be.true
    })

    it('should create bundle one', () => {
      compareReferenceData(scriptRefs[entry], output)
    })
  })

  describe('Include Component', () => {
    let entry = Object.keys(componentEntries)[0],
        output = componentEntries[entry]

    before(() => {
      templater.on.reset()
      clearOutputData(output, Object.keys(componentRefs[entry]))
      clientjs = makeClientJS()
      clientjs.includeComponent('my-template', entry)
      emitLifecycleEvent('launch')
      return clientjs.readyToBuild // await completion of build (so we can check results)
    })

    it('should call templater and render', ()=> {
      templater.on.calledWith('renderContext.my-template').should.be.true
    })

    it('should create bundle one', () => {
      compareReferenceData(componentRefs[entry], output)
    })
  })
})
