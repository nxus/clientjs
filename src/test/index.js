'use strict';

import fs from 'fs'
import path from 'path'

import ClientJS from '../'
import {clientjs as clientjsProxy} from '../'

import sinon from 'sinon'

import {application as app} from 'nxus-core'
import {router} from 'nxus-router'

import {should as Should} from 'chai'

var should = Should()

describe('ClientJS', () => {
  var clientjs;

  before(() => {
    sinon.spy(app, 'once')
    sinon.spy(app, 'onceAfter')
    sinon.spy(clientjsProxy, 'respond')
    sinon.spy(clientjsProxy, 'request')
  })
  
  describe('Load', () => {
    it('should not be null', () => ClientJS.should.not.be.null)

    it('should not be null', () => {
      ClientJS.should.not.be.null
      clientjsProxy.should.not.be.null
    })

    it('should be instantiated', () => {
      clientjs = new ClientJS();
      clientjs.should.not.be.null;
    });
  });

  describe('Init', () => {
    beforeEach(() => {
      app.config['client-js'] = {
        entries: {
          'test/apps/one.js': 'test/apps/one-bundled.js',
          'test/apps/two.js': 'test/apps/two-bundled.js'
        }
      };
      
      clientjs = new ClientJS();
    });
    
    it('should have the config', () => {
      should.exist(clientjs.config.entries)
      should.exist(clientjs.config.entries['test/apps/one.js'])
      clientjs.config.entries['test/apps/one.js'].should.eql('test/apps/one-bundled.js')
    });

    it('should use the default babelrc config', () => {
      should.exist(clientjs.config.babel)
      should.exist(clientjs.config.babel['presets'])
    })
  });
  describe('Bundle', () => {

    before(() => {
      sinon.spy(router, 'provide')
    })
    
    beforeEach(() => {
      try {
        fs.unlinkSync(path.resolve('test/apps/one-bundled.js'))
      } catch (e) {}
      
      clientjs = new ClientJS(app);
      clientjs.bundle('tests/apps/one.js', 'test/apps/one-bundled.js');
    });
    
    it('should create bundle one', (done) => {
      fs.access(path.resolve('.tmp/test/apps/one-bundled.js'), (err) => {
        (err == null).should.be.true;
        done();
      });
    });

    it('should provide asset routes', (done)=> {
      router.provide.calledWith('staticRoute', '/assets/clientjs/test/apps').should.be.true
      done();
    });
  });
});