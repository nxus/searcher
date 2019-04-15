/**
 * @jest-environment node
 */

/* globals beforeEach: false, describe: false, it: false, expect: false */

'use strict';

import Searcher from '../src/'
import {searcher} from '../src/'

describe("Searcher", () => {
  var module
 
  describe("Load", () => {
    it("should not be null", () => {
      expect(Searcher).not.toBeNull()
      expect(searcher).not.toBeNull()
    })

    it("should be instantiated", () => {
      module = new Searcher();
      expect(module).not.toBeNull()
    });

    it("should have searchable", () => {
      expect(module).toHaveProperty('searchable')
    })
  });

  describe("Indexes", () => {
    beforeEach(() => {
      module = new Searcher()
    })
    it("should register the default document", () => {
      expect(module._searchDocuments).toHaveProperty('', 'searchdocument')
    })
    it("createSearchDocument should register new model", () => {
      module._createSearchDocument('second')
      expect(module._searchDocuments).toHaveProperty('second', 'searchdocument-second')
    })
  })
  
  describe("Query", () => {
    beforeEach(() => {
      module = new Searcher()
      module.modelConfig['test'] = {model: 'test', fields: ['name', 'title']}
    })
    it("should take a text field", () => {
      let q = module._buildQuery("test", "text")
      expect(q).toEqual({
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
      expect(q).toEqual({
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
      expect(q).toEqual({
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
      expect(q).toEqual({
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
      expect(q).toEqual({
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
      expect(q).toEqual({
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
      expect(q).toEqual({
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
