/* 
* @Author: Mike Reich
* @Date:   2016-02-13 08:59:44
* @Last Modified 2016-05-20
*/

'use strict';

import Searcher from '../src/'
import {searcher} from '../src/'

describe("Searcher", () => {
  var module
 
  beforeEach(() => {
    module = new Searcher();
  });
  
  describe("Load", () => {
    it("should not be null", () => {
      Searcher.should.not.be.null
      searcher.should.not.be.null
    })

    it("should be instantiated", () => {
      module = new Searcher();
      module.should.not.be.null;
    });

    it("should have searchable", () => {
      module.searchable.should.not.be.null
    })
  });
})
