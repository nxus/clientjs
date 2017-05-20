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
  'src/test/apps/one.js': 'test/apps/one-bundled.js',
  'src/test/apps/two.js': 'test/apps/two-bundled.js'
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

describe('ClientJS', () => {
  var clientjs, refs = {};

  before(() => {
    sinon.spy(app, 'once')
    sinon.spy(app, 'onceAfter')
    sinon.spy(clientjsProxy, 'respond')
    sinon.spy(clientjsProxy, 'request')

    // load reference copies of bundled files (for comparison)
    for (let key in configEntries) {
      let p = configEntries[key].replace('test/apps/', 'src/test/data/')
      p = path.resolve(p)
      let ref = fs.readFileSync(p, 'utf8')
      refs[key] = ref
    }
  })

  describe('Load', () => {
    it('should not be null', () => ClientJS.should.not.be.null)

    it('should not be null', () => {
      ClientJS.should.not.be.null
      clientjsProxy.should.not.be.null
    })

    it('should be instantiated', () => {
      clientjs = makeClientJS();
      clientjs.should.not.be.null;
    });
  });

  describe('Init', () => {
    beforeEach(() => {
      clientjs = makeClientJS({entries: configEntries});
    });

    it('should have the config', () => {
      should.exist(clientjs.config.entries)
      for (let key in configEntries)
        clientjs.config.entries.should.have.property(key, configEntries[key])
    });

    it('should use the application client_js config', () => {
      should.exist(clientjs.config.babel)
      clientjs.config.babel.should.have.property('presets')
    })
  });
  describe('Bundle', () => {
    let entry = Object.keys(configEntries)[0],
        output = configEntries[entry]

    before(() => {
      router.staticRoute = sinon.spy()
    })

    beforeEach(() => {
      try {
        fs.unlinkSync(path.resolve('.tmp/clientjs/'+output))
      } catch (e) {}
      clientjs = makeClientJS();
      return clientjs.bundle(entry, output);
    });

    it('should create bundle one', (done) => {
      let p = path.resolve('.tmp/clientjs/'+output)
      fs.readFile(p, 'utf8', (err, data) => {
        expect(err).to.be.null
        data.should.equal(refs[entry])
        done()
      })
    });

    it('should provide asset routes', (done)=> {
      router.staticRoute.calledWith('/assets/clientjs/test/apps').should.be.true
      done();
    });
  });

  describe('Bundle Missing Entry', () => {
    let entry = 'src/test/apps/missing.js',
        output = 'test/apps/missing-bundled.js'

    it('should reject with error', () => {
      return clientjs.bundle(entry, output).should.be.rejectedWith(Error)
    })
    it('should not create bundle', () => {
      let p = path.resolve('.tmp/clientjs/'+output)
      expect(fs.existsSync(p)).to.be.false
    });
  });

  describe('Bundle Invalid Entry', () => {
    let entry = 'src/test/apps/invalid.js',
        output = 'test/apps/invalid-bundled.js'

    it('should reject with error', () => {
      return clientjs.bundle(entry, output).should.be.rejectedWith(Error)
    })
    it('should not create bundle', () => {
      let p = path.resolve('.tmp/clientjs/'+output)
      expect(fs.existsSync(p)).to.be.false
    });
  });

  describe('Include Script', () => {
    before(() => {
      sinon.spy(templater, 'on')
      clientjs = makeClientJS();
      clientjs.includeScript('my-template', 'tests/apps/one.js');
      app.emit('launch')
    });

    it('Call templater and render', (done)=> {
      templater.on.calledWith('renderContext.my-template').should.be.true
      router.staticRoute.calledWith('/assets/clientjs/my-template').should.be.true
      done();
    });
  })
});