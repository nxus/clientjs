'use strict';

import fs from 'fs'
import path from 'path'

import ClientJS from '../src/'

import TestApp from '@nxus/core/lib/test/support/TestApp';

describe("ClientJS", () => {
  var clientjs;
  var app = new TestApp();
 
  beforeEach(() => {
    app = new TestApp();
  });
  
  describe("Load", () => {
    it("should not be null", () => ClientJS.should.not.be.null)

    it("should be instantiated", () => {
      clientjs = new ClientJS(app);
      clientjs.should.not.be.null;
    });
  });
  describe("Init", () => {
    beforeEach(() => {
      app.config.clientjs = {
        entries: {
          'test/apps/one.js': 'test/apps/one-bundled.js',
          'test/apps/two.js': 'test/apps/two-bundled.js'
        }
      };
      
      clientjs = new ClientJS(app);
    });
    it("should gather bundle", () => {
      app.get.calledWith('clientjs').should.be.true;
      app.get().gather.calledWith('bundle').should.be.true;
    });
    it("should provide local bundles", () => {
      app.get().provide.calledWith('bundle', 'test/apps/one.js', 'test/apps/one-bundled.js').should.be.true;
      app.get().provide.calledWith('bundle', 'test/apps/two.js', 'test/apps/two-bundled.js').should.be.true;
    });
  });
  describe("Bundle", () => {
    beforeEach(() => {
      try {
        fs.unlinkSync(path.resolve('test/apps/one-bundled.js'))
        fs.unlinkSync(path.resolve('test/apps/one-bundled.js'))
      } catch (e) {}
      
      clientjs = new ClientJS(app);
      clientjs.bundle('tests/apps/one.js', 'test/apps/one-bundled.js');
    });
    
    it("should create bundle one", (done) => {
      fs.access(path.resolve('.tmp/test/apps/one-bundled.js'), (err) => {
        (err == null).should.be.true;
        done();
      });
    });
    it("should provide asset routes", (done)=> {
      app.get.calledWith('router').should.be.true;
      app.get().provide.calledWith('setStatic', '/test/apps').should.be.true
      done();
    });
  });
});
