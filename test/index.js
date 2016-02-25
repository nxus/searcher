/* 
* @Author: Mike Reich
* @Date:   2016-02-13 08:59:44
* @Last Modified 2016-02-21
*/

'use strict';

import Module from '../src/'

import TestApp from '@nxus/core/lib/test/support/TestApp';

describe("Module", () => {
  var module, app;
 
  beforeEach(() => {
    app = new TestApp();
    module = new Module(app);
  });
  
  describe("Load", () => {
    it("should not be null", () => Module.should.not.be.null)

    it("should be instantiated", () => {
      module = new Module(app);
      module.should.not.be.null;
    });

    it("should setup gathers", () => {
      app.get.calledWith('searcher').should.be.true;
      app.get('searcher').gather.calledWith('searchable').should.be.true;
    })
  });
})