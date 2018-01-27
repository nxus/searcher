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
 * The Searcher module depends on @nxus/storage.  The first step is adding and configuring the search adapter you'd like to use.
 * For example, if we want to enable ElasticSearch, we first install the waterline-elasticsearch adapter, then setup the configuration 
 * options in the Storage config.
 *
 *    > npm install waterline-elasticsearch --save
 *
 * then add to package.json
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
 * By default, Searcher will look for a field named `title`, `name`, or `description to use as the search field. You can specify different, or 
 * multiple fields to search by specifying a second options parameter, with the `fields` key:
 *
 *    searcher.searchable('user', {fields: 'firstName'})
 *    searcher.searchable('user', {fields: ['firstName', 'lastName']})
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

/**
 * The Search class enables automated searching of models using different adapters.
 */
export default class Searcher extends NxusModule {
  constructor(opts={}) {
    super(opts)

    this.pageTemplate = opts.pageTemplate || 'page'
    this.itemsPerPage = opts.itemsPerPage || 20
    
    this.modelConfig = {}

    app.before('init', () => {
      this._setDefaultConfig()
    })

    storage.model(SearchDocument)

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

  /**
   * Register a model to be searchable.
   * @param  {string} model the model identity
   * @param  {Object} opts  An optional hash of options.
   */
  searchable(model, opts = {}) {
    this.log.debug('Registering searchable', model, opts)
    if(!opts.fields) opts.fields = ['name', 'title', 'description']
    opts.model = model
    this.modelConfig[model] = opts
    this.modelConfig[pluralize(model)] = opts

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
    let SD = await storage.getModel('searchdocument')
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
    let SD = await storage.getModel('searchdocument')
    let query = this._buildQuery(model, text, opts)
    return  SD.count().where(query)
  }
  
  /**
   * Reindex all of a model's documents
   * @param  {string} model the model identity
   */
  async reindex(model) {
    // TODO ElasticSearch offers the ability to reindex by building a new index and then replacing
    // TODO We should use that.
    let [SD, M] = await storage.getModel(['searchdocument', model])
    let objs = await M.find()
    let obj = objs[0]
    objs.forEach(async (obj) => {
      let exists = await SD.count().where({id: obj.id})
      if (exists >= 1) {
        await this._handleUpdate(model, obj)
      } else {
        await this._handleCreate(model, obj)
      }
    })
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
      for (let key in opts.filters) {
        let f = {}
        f[key] = opts.filters[key]
        query.query.bool.filter.push({term: f})
      }
    }
    if (opts.sort) {
      query.sort = opts.sort;
    }

    return query
  }
  
  async _handleCount(req, res, model) {
    let q = req.param('q') || {}
    let [SD, M] = await storage.getModel(['searchdocument', model])
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
    doc.model = model
    let SD = await storage.getModel('searchdocument')
    try {
      await SD.create(doc)
      this.log.debug('Search document created', model)
    } catch (e) {
      this.log.error('Could not create search doc', e)
    }
  }

  async _handleDestroy(model, doc) {
    if(!this.modelConfig[model]) return
    let SD = await storage.getModel('searchdocument')
    try {
      await SD.destroy().where(doc.id)
      this.log.debug('Search document deleted', model)
    } catch (e) {
      this.log.error('Could not delete search doc', e)
    }
  }

  async _handleUpdate(model, doc) {
    if(!this.modelConfig[model]) return
    let SD = await storage.getModel('searchdocument')
    try {
      await SD.update(doc.id, doc)
      this.log.debug('Search document updated', model)
    } catch (e) {
      this.log.error('Could not update search doc', e)
    }
  }
} 

export let searcher = Searcher.getProxy()
