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

  describe("Indexes", () => {
    before(() => {
      module = new Searcher()
    })
    it("should register the default document", () => {
      module._searchDocuments.should.have.property('', 'searchdocument')
    })
    it("createSearchDocument should register new model", () => {
      module._createSearchDocument('second')
      module._searchDocuments.should.have.property('second', 'searchdocument-second')
    })
  })
  
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
      let q = module._buildQuery("test", "text", {filters: [{term: {type: 'value'}}]})
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
    it("should take a match options opt", () => {
      let q = module._buildQuery("test", "long text phrase", {fields: ["title"], match_options: {
        operator: "and",
        minimum_should_match: "75%"
      }})
      q.should.eql({
        query: {
          bool: {
            minimum_should_match: 1,
            should: [
              {match: {title: {query: "long text phrase",
                              operator: "and",
                              minimum_should_match: "75%"}}}
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
