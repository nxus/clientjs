'use strict';

import fs from 'fs'
import path from 'path'

import ClientJS from '../src/ClientJS'

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
      try {
        fs.unlinkSync(path.resolve('test/apps/one-bundled.js'))
        fs.unlinkSync(path.resolve('test/apps/one-bundled.js'))
      } catch (e) {}
      app.config.clientjs = {
        entries: {
          'test/apps/one.js': 'test/apps/one-bundled.js',
          'test/apps/two.js': 'test/apps/two-bundled.js'
        }
      };
      
      clientjs = new ClientJS(app);
    });

    it("should create bundle one", (done)=> {
      fs.access(path.resolve('test/apps/one-bundled.js'), (err) => {
        (err == null).should.be.true;
        done();
      });
    });
    it("should create bundle two", (done)=> {
      fs.access(path.resolve('test/apps/two-bundled.js'), (err) => {
        (err == null).should.be.true;
        done();
      });
    });
  });
});
