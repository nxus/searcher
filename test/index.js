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

  describe("Query", () => {
    before(() => {
      module = new Searcher()
      module.modelConfig['test'] = {model: 'test', fields: ['name', 'title']}
    })
    it("should take a text field", () => {
      let q = module._buildQuery("test", "text")
      q.should.eql({
        query: {
          bool: {
            minimum_should_match: 1,
            should: [
              {match: {name: "text"}},
              {match: {title: "text"}},              
            ],
            filter: [
              {term: {model: "test"}}
            ]
          }
        }
      })
    })
    it("should take a text field and extra filters", () => {
      let q = module._buildQuery("test", "text", {filters: {type: 'value'}})
      q.should.eql({
        query: {
          bool: {
            minimum_should_match: 1,
            should: [
              {match: {name: "text"}},
              {match: {title: "text"}}
            ],
            filter: [
              {term: {model: "test"}},
              {term: {type: "value"}}
            ]
          }
        }
      })
    })
    it("should take a text field and paging options", () => {
      let q = module._buildQuery("test", "text", {limit: 10, skip: 5})
      q.should.eql({
        query: {
          bool: {
            minimum_should_match: 1,
            should: [
              {match: {name: "text"}},
              {match: {title: "text"}}
            ],
            filter: [
              {term: {model: "test"}}
            ]
          }
        },
        size: 10,
        from: 5
      })
    })
    it("should take a text field and sort option", () => {
      let q = module._buildQuery("test", "text", {sort: ["name", {"title": "desc"}]})
      q.should.eql({
        query: {
          bool: {
            minimum_should_match: 1,
            should: [
              {match: {name: "text"}},
              {match: {title: "text"}}
            ],
            filter: [
              {term: {model: "test"}}
            ]
          }
        },
        sort: ["name", {"title": "desc"}]
      })
    })
    it("should take an alternate match query type", () => {
      let q = module._buildQuery("test", "text", {match_query: 'prefix'})
      q.should.eql({
        query: {
          bool: {
            minimum_should_match: 1,
            should: [
              {prefix: {name: "text"}},
              {prefix: {title: "text"}}
            ],
            filter: [
              {term: {model: "test"}}
            ]
          }
        }
      })
    })
    it("should take a minimum_should_match ovveride", () => {
      let q = module._buildQuery("test", "text", {minimum_should_match: 0})
      q.should.eql({
        query: {
          bool: {
            minimum_should_match: 0,
            should: [
              {match: {name: "text"}},
              {match: {title: "text"}}
            ],
            filter: [
              {term: {model: "test"}}
            ]
          }
        }
      })
    })
    it("should take an alternate list of fields", () => {
      let q = module._buildQuery("test", "text", {fields: ["title"]})
      q.should.eql({
        query: {
          bool: {
            minimum_should_match: 1,
            should: [
              {match: {title: "text"}}
            ],
            filter: [
              {term: {model: "test"}}
            ]
          }
        }
      })
    })
  })
})
