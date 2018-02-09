/* 
* @Author: Mike Reich
* @Date:   2016-02-05 07:45:34
* @Last Modified 2016-05-20
*/
/**
 *
 * [![Build Status](https://travis-ci.org/nxus/searcher.svg?branch=master)](https://travis-ci.org/nxus/searcher)
 * 
 * The Searcher module enables easy searching of Nxus models using ElasticSearch.
 * 
 * # Installation
 * 
 *     > npm install nxus-searcher --save
 * 
 * # Usage
 *
 * ## Configuration
 * 
 * The Searcher module depends on @nxus/storage.  The first step is adding and configuring the search adapter in .nxusrc (The following config is default and added for you, see the Optional Configuration section below for common additions):
 *
 *    "storage": {
 *      "adapters": {
 *        ...
 *        "searcher": "waterline-elasticsearch"
 *      },
 *      "connections": {
 *        ...
 *        "searcher: {
 *          "adapter": "searcher",
 *          "host": "<host address>:9200",
 *          "log": "warning",
 *          "index": "searcher",
 *          "mappings": {"searchdocument": {"properties": {"id": {"type":"keyword"}, "model":{"type": "keyword"}}}}
 *        }
 *      }
 *    }
 *
 * ## Register model
 * Now that the correct Storage adapters are configured, you'll need to tell Searcher which models you want to enable 
 * search using the `searchable` method. Searchable accepts an identity for a model which has already been registered.
 *
 *    import {searcher} from 'nxus-searcher'
 *    searcher.searchable('user')
 *
 * By default, Searcher will look for a field named `title`, `name`, or `description` to use as the search field. You can specify different, or 
 * multiple fields to search by specifying a second options parameter, with the `fields` key:
 *
 *    searcher.searchable('user', {fields: 'firstName'})
 *    searcher.searchable('user', {fields: ['firstName', 'lastName']})
 *
 * ## Optional Configuration
 * 
 * Connections in the `storage` config correspond to ElasticSearch indexes. In addition to the `index` name, you may configure
 * the `mappings` and `analysis` sections here to control ElasticSearch's index and query behavior.
 * 
 * If you provide your own mapping config, it is required that you specify the `id` and `model` fields as `keywords`:
 *     "mappings": {"searchdocument": {"properties": {"id": {"type":"keyword"}, "model":{"type": "keyword"}}}}
 *
 * An example use for specifying both mapping and analysis is to provide autocomplete-style ngram indexing on some fields.
 * ```
 *      "mappings": {
 *        "searchdocument": {
 *          {"properties": {"id": {"type":"keyword"}, "model":{"type": "keyword"},
 *             "name": {
 *               "type": "text",
 *               "analyzer": "autocomplete",
 *               "search_analyzer": "standard"
 *             }
 *          }},
 *        }
 *      },
 *      "analysis": {
 *        "filter": {
 *          "autocomplete_filter": {
 *            "type": "edge_ngram",
 *            "min_gram": 1,
 *            "max_gram": 20
 *          }
 *        },
 *        "analyzer": {
 *          "autocomplete": {
 *            "type": "custom",
 *            "tokenizer": "standard",
 *            "filter": [
 *              "lowercase",
 *              "autocomplete_filter"
 *            ]
 *          }
 *        }
 *      },
 * ```
 * 
 * ## Multiple Search Indexes
 * 
 * By default, you may index many different storage model documents to one ElasticSearch index, for when you don't
 * need separate config to handle field differences between models.
 * 
 * If you need to maintain separate search indexes, you first need to add a new connection to `.nxusrc` based on the
 * default connection fields and mapping listed in Configuration above.
 * 
 * When registering a model as searchable, you may pass an `index` option to specify a which connection/index to use
 * 
 *  `searcher.searchable('model', {index: 'alternate'})
 * 
 * ## Queries
 * 
 * `searcher.search(model, term, opts)` takes a number of options to provide access to most of ElasticSearch's
 * query format.
 * 
 * It is assumed we are always performing a boolean OR (`should`) of query term matches (by default, across the 
 * field names registered for searching the model) but requiring at least one match, and in addition performing 
 * some required `filter`ing (by default, to limit results to the appropriate `model`). Options that control this:
 * 
 *  * `minimum_should_match` [1] to make the results more or less restrictive to the search term
 *  * `fields` [fields specified to `searchable`] override which fields to full-text search
 *  * `match_query` [match] the ES query to use for full-text - maybe `prefix` or `match_phrase` instead.
 *  * `match_options` [{}] additional ES options for each field level query
 *  * 'filters' [[]] array of additional ES filter objects to restrict the query
 *  * `sort` [] array of sort fields
 *
 * It is highly recommended that you read the ElasticSearch Query DSL documentation to change most of these options.
 * To help you map these parameters to the ES query, here are two calls to search and the resulting query:
 *
 * `searcher.search('test-model', 'search term')`
 *  ```
 *       query: {
 *         bool: {
 *           minimum_should_match: 1,
 *           should: [
 *             {match: {name: "search term"}},
 *             {match: {title: "search term"}},
 *             {match: {description: "search term"}},              
 *           ],
 *           filter: [
 *             {term: {model: "test-model"}}
 *           ]
 *         }
 *       }
 *  ```
 * 
 *  ```
 *  searcher.search('test-model', 'search term', {
 *    minimum_should_match: "50%",
 *    fields: ['name', 'lastName'],
 *    match_query: "match_phrase",
 *    match_options: {analyzer: 'my-analyzer'},
 *    filters: [{term: {type: 'person'}}],
 *    sort: [{name: 'desc'}, 'lastName']
 *  })
 *  ``` 
 *  ``` 
 *       query: {
 *         bool: {
 *           minimum_should_match: "50%",
 *           should: [
 *             {match_phrase: {name: "search term", analyzer: 'my-analyzer'}},
 *             {match_phrase: {lastName: "search term", analyzer: 'my-analyzer'}},
 *           ],
 *           filter: [
 *             {term: {model: "test-model"}},
 *             {term: {type: "person"}}
 *           ]
 *         }
 *       },
 *       sort: [{name: 'desc'}, 'lastName']
 *  ``` 
 *
 * ## Routes
 * Based on the model identify, Searcher will create the following routes
 *
 *     /search/user
 *
 * which accepts a search parameter `q`. So to search for the term 'pizza':
 *
 *     /search/user?q=mike
 *
 * The search wil return a list of results using the views below.
 * 
 * ## Views
 * You can provide search specific views to be used for search results:
 *
 * 1. search-user-list: the list view for returned search results.
 * 1. search-user-detail: the detail view for an individual search result.
 * 
 * Alternatively, if no search templates are found, searcher will automatically use the `@nxus/base-ui` views for any model 
 * that is searchable (if they exist).
 *
 * 1. view-user-list: the list view used to display search results.
 * 1. view-user-detail: the detail view linked to from the list view.
 *
 * Finally, searcher will use default list/detail views if no other templates are found. 
 * 
 * # API
 * 
 */

'use strict';

import {application as app, NxusModule} from 'nxus-core'
import {storage} from 'nxus-storage'
import {templater} from 'nxus-templater'
import {router} from 'nxus-router'

import SearchDocument from './models/searchDocument.js'
import _ from 'underscore'
import Promise from 'bluebird'
import pluralize from 'pluralize'

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * The Search class enables automated searching of models using different adapters.
 */
class Searcher extends NxusModule {
  constructor(opts={}) {
    super(opts)

    this.pageTemplate = opts.pageTemplate || 'page'
    this.itemsPerPage = opts.itemsPerPage || 20
    
    this.modelConfig = {}

    app.before('init', () => {
      this._setDefaultConfig()
    })

    this._searchDocuments = {}
    this._createSearchDocument()

    router.route('get', this.config.baseUrl+"/:model/:id", ::this._searchDetail)
    router.route('get', this.config.baseUrl+"/:model", ::this._searchResults)

  }

  _defaultConfig() {
    return {
      baseUrl: '/search'
    }
  }

  _setDefaultConfig() {
    var conf = app.config.storage
    var defaultMapping = {"searchdocument": {"properties": {"id": {"type":"keyword"}, "model":{"type": "keyword"}}}}
    if(!conf.adapters) conf.adapters = {}
    if(!conf.connections) conf.connections = {}
    if(!conf.adapters.searcher) {
      conf.adapters.searcher = "waterline-elasticsearch"
      conf.connections.searcher = {
         "adapter": "searcher",
         "host": app.config.host+":9200",
         "log": "warning",
         "index": "searcher",
         "mappings": defaultMapping
      }
    }
    if(!conf.connections.searcher.mappings) {
      conf.connections.searcher.mappings = defaultMapping
    }
  }

  _createSearchDocument(index='') {
    if (this._searchDocuments[index] !== undefined) {
      return this._searchDocuments[index]
    }
    let ident = 'searchdocument'
    if (!index) {
      storage.model(SearchDocument)
    } else {
      ident = `searchdocument-${index}`
      let model = SearchDocument.extend({identity: ident, connection: index})
      storage.model(model)
    }
    this._searchDocuments[index] = ident
    return ident
  }

  /**
   * Register a model to be searchable.
   * @param  {string} model the model identity
   * @param  {Object} opts  Options {fields, populate, index}
   */
  searchable(model, opts = {}) {
    this.log.debug('Registering searchable', model, opts)
    if(!opts.fields) opts.fields = ['name', 'title', 'description']
    opts.model = model
    this.modelConfig[model] = opts
    this.modelConfig[pluralize(model)] = opts

    opts.searchdocument = this._createSearchDocument(opts.index)

    storage.on('model.create', ::this._handleCreate)
    storage.on('model.update', ::this._handleUpdate)
    storage.on('model.destroy', ::this._handleDestroy)

    templater.default().template(__dirname+'/templates/searcher-detail.ejs', this.pageTemplate,  'search-'+model+'-detail')
    templater.default().template(__dirname+'/templates/searcher-list.ejs', this.pageTemplate, 'search-'+model+'-list')
    
  }


  /**
   * Search a model for text matches.
   * @param  {string} model the model identity
   * @param  {string} text  search value
   * @param  {Object} opts Options for {filters, limit, skip, sort}
   * @return {Array}  result objects 
   */
  async search(model, text, opts) {
    let SD = await this._getSearchDocument(model)
    let query = this._buildQuery(model, text, opts)
    return  SD.find().where(query).limit(opts.limit).skip(opts.skip)
  }

  /**
   * Count results of model for text matches.
   * @param  {string} model the model identity
   * @param  {string} text  search value
   * @param  {Object} opts Options for {filters, limit, skip, sort}
   * @return {Array}  result objects 
   */
  async count(model, text, opts) {
    let SD = await this._getSearchDocument(model)
    let query = this._buildQuery(model, text, opts)
    return  SD.count().where(query)
  }
  
  /**
   * Reindex all of a model's documents. Different services concurrent request and queue limits are parameters
   * @param  {string} model the model identity
   * @param  {string} concurrent how many docs to concurrently process
   * @param  {string} interval ms to wait between doc chunks
   * @param  {string} start to restart indexing from midway
   */
  async reindex(model, concurrent=100, interval=100, start=0) {
    // TODO ElasticSearch offers the ability to reindex by building a new index and then replacing
    // TODO We should use that.
    let SD = await this._getSearchDocument(model)
    let M = await storage.getModel(model)
    let objs = await M.find()

    objs = objs.slice(start)
    
    // Wait to let queue empty
    while (objs.length) {
      objs.slice(0, concurrent).forEach(async (obj) => {
        let exists = await SD.count().where({id: obj.id})
        try {
          if (exists >= 1) {
            return this._handleUpdate(model, obj)
          } else {
            return this._handleCreate(model, obj)
          }
        } catch(e) {
          this.log.error("error reindexing", e)
        }
      })
      objs = objs.slice(concurrent)
      await timeout(interval)
    }
  }

  _getSearchDocument(model) {
    return storage.getModel(this.modelConfig[model].searchdocument)
  }
  
  async _searchDetail(req, res) {
    let m = await storage.getModel(req.params.model)
    let r = await m.findOne(req.param('id'))
    let opts = {}
    opts[model] = r
    opts.inst = r
    opts.attributes = _.map(_.keys(M._attributes), (k) => {let ret = M._attributes[k]; ret.name = k; return ret})
    opts.title = 'View '+r.id
    templater.render('search-'+model+'-detail', opts).then(res.send.bind(res))
  }

  async _searchResults(req, res) {
    modelOpts = this.modelConfig[this.params.model]
    if (modelOpts === undefined) {
      res.status(404).send("Model Not Found")
      return
    }
    let model = modelOpts.model
    let page = parseInt(req.param('page')) || 1
    let results = await this._handleSearch(req, res, model)
    let total = await this._handleCount(req, res, model)
    let totalPages = total > 0 ? Math.ceil(total/10) : 0
    let opts = {
      total,
      page,
      itemsPerPage: 10,
    }
    opts[pluralize(model)] = results
    opts.title = 'Search Results for '+req.param('q')
    let m = await storage.getModel(model)
    opts.attributes = _.map(_.keys(M._attributes), (k) => {let ret = M._attributes[k]; ret.name =k; return ret})
    opts.insts = results
    opts.base = "/search/"+pluralize(model)+"?q="+encodeURIComponent(req.param('q'))+"&"
    opts.req = req
    templater.render('search-'+model+'-detail', opts).then(res.send.bind(res))
  }

  _buildQuery(model, text, opts={}) {
    opts.match_query = opts.match_query || 'match'

    if (!opts.hasOwnProperty('minimum_should_match')) {
      opts.minimum_should_match = 1
    }
    
    let query = {
        query: {
          bool: {
            minimum_should_match: opts.minimum_should_match,
            should: [
            ],
            filter: [
              {term: {model: model}}
            ]
          }
      }
    }

    let fields = opts.fields || this.modelConfig[model].fields
    
    for(let field of fields) {
      var m, o = {}
      o[opts.match_query] = {}
      
      if (opts.match_options) {
        m = Object.assign({query: text}, opts.match_options)
      } else {
        m = text
      }
      o[opts.match_query][field] = m
      query.query.bool.should.push(o)
    }
    
    if (opts.filters) {
      query.query.bool.filter.push(...opts.filters)
    }
    if (opts.sort) {
      query.sort = opts.sort;
    }

    return query
  }
  
  async _handleCount(req, res, model) {
    let q = req.param('q') || {}
    let SD = await this._getSearchDocument(model)
    let M = await storage.getModel(model)
    let query = this._buildQuery(model, q)
    return SD.count().where(query)
  }

  async _handleSearch(req, res, model) {
    let q = req.param('q') || {}
    let limit = this.itemsPerPage
    let skip = ((parseInt(req.param('page')) || 1)-1)*limit
    this.log.debug('Searching for', model, q)
    let results = await this.search(model, q, {limit, skip})
    let ids = await SD.find().where(query)
    let populate = this.modelConfig[model].populate
    ids = _.pluck(ids, 'id')
    let idq = M.find().where({id: ids})
    if(populate)
      idq.populate(populate)
    return idq
    
  }

  async _handleCreate(model, doc) {
    if(!this.modelConfig[model]) return
    doc = Object.assign({model}, doc)
    let SD = await this._getSearchDocument(model)
    await SD.create(doc)
    this.log.debug('Search document created', model)
  }

  async _handleDestroy(model, doc) {
    if(!this.modelConfig[model]) return
    let SD = await this._getSearchDocument(model)
    await SD.destroy().where(doc.id)
    this.log.debug('Search document deleted', model)
  }

  async _handleUpdate(model, doc) {
    if(!this.modelConfig[model]) return
    let SD = await this._getSearchDocument(model)
    await SD.update(doc.id, doc)
    this.log.debug('Search document updated', model)
  }
} 

let searcher = Searcher.getProxy()

export {
  Searcher as default,
  searcher,
  SearchDocument
}
