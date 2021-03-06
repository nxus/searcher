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
 * Some ES providers like Bonsai limit the number of concurrent reads/writes,
 * and respond with a 429 error over limit. Providers may also have temporary
 * service outages that are reported as 502 errors. By default searcher catches
 * these errors and retries with an exponential delay.
 *
 * The default settings are an interval of 200ms, exponential factor of 4, and
 * 4 attempts. (So, delays of 200ms, 800ms, 3200ms and 12800ms.)
 *
 * You can configure the delay interval (ms) and maximum number of attempts:
 *
 *   "searcher": {
 *     "retryDelay": 200,
 *     "retryFactor": 2,
 *     "retryAttempts": 4
 *   }
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
 * You can also specify a processor function (Promise or sync) to modify
 * the  document before indexing - if there are elasticsearch-incompatible fields, etc
 *
 *    searcher.searchable('user', {processor: (doc) => {return doc} })
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
 * The `searcher.search(model, query, opts)` method searches a model for
 * text matches. It accepts either a text string as the `query`
 * parameter, or an ElasticSearch query object. For most searches, you
 * can provide a text string and let it assemble a query object. For
 * more complex searches, you can define your own query object. (The
 * `searcher.count(model, query, opts)` method works the same way.)
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

'use strict'

import {application as app, NxusModule} from 'nxus-core'
import {storage} from 'nxus-storage'
import {templater} from 'nxus-templater'
import {router} from 'nxus-router'

import SearchDocument from './models/searchDocument.js'
import _ from 'underscore'
import pluralize from 'pluralize'
import {retry} from '@lifeomic/attempt'

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
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
      baseUrl: '/search',
      retryDelay: 200,
      retryFactor: 4,
      retryAttempts: 4
    }
  }

  _setDefaultConfig() {
    let conf = app.config.storage
    let defaultMapping = {"searchdocument": {"properties": {"id": {"type":"keyword"}, "model":{"type": "keyword"}}}}
    if (!conf.adapters) conf.adapters = {}
    if (!conf.connections) conf.connections = {}
    if (!conf.adapters.searcher) {
      conf.adapters.searcher = "waterline-elasticsearch"
      conf.connections.searcher = {
         "adapter": "searcher",
         "host": app.config.host+":9200",
         "log": "warning",
         "index": "searcher",
         "mappings": defaultMapping
      }
    }
    if (!conf.connections.searcher.mappings) {
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
   *
   * These options properties may be specified:
   * *   `fields` (string|Array<string>) - fields to search, specified
   *       as a single field name or an array of field names
   *       (default setting is `['title', 'name', 'description']`)
   * *   `index` (string) - name of connection/index to use for search
   * *   `processor` (Function) - a processor function to modify
   *       documents before indexing; passed a document instance, it
   *       should return the modified instance (sync) or a Promise that
   *       resolves to the modified instance (async)
   * *   `populate` - a Waterline `populate()` parameter, used to
   *       populate document instances for the search results list view
   *
   * A typical use for the processor function is to remove fields that
   * are incompatible with Elasticsearch (e.g. polymorphic fields).
   *
   * @param  {string} model the model identity
   * @param  {Object} opts  options
   */
  searchable(model, opts = {}) {
    this.log.debug('Registering searchable', model, opts)
    if (!opts.fields) opts.fields = ['name', 'title', 'description']
    opts.model = model
    this.modelConfig[model] = opts
    this.modelConfig[pluralize(model)] = opts

    opts.searchdocument = this._createSearchDocument(opts.index)

    storage.on('model.create.'+model, ::this._handleCreate)
    storage.on('model.update.'+model, ::this._handleUpdate)
    storage.on('model.destroy.'+model, ::this._handleDestroy)

    templater.default().template(__dirname+'/templates/searcher-detail.ejs', this.pageTemplate, 'search-'+model+'-detail')
    templater.default().template(__dirname+'/templates/searcher-list.ejs', this.pageTemplate, 'search-'+model+'-list')

  }

  _retryLimit(operation, handler) {
    return retry(handler, {
      delay: this.config.retryDelay,
      factor: this.config.retryFactor,
      maxAttempts: this.config.retryAttempts,
      handleError: (err, context) => {
        let status = err.originalError && err.originalError.statusCode
        if ((status == 429) || (status == 502))
          this.log.trace(`Retrying ${operation}, ${err.originalError.message}`)
        else {
          let msg = (context.attemptNum === 0) ? `${operation} errored` : `${operation} retry ${context.attemptNum} errored`
          this.log.info(msg, err)
          context.abort()
        }
      }
    })
  }


  /**
   * Search a model for text matches.
   *
   * The `query` parameter is either a text string or an ElasticSearch
   * query object. Specify a text string to let the `search()` method
   * assemble the query object; for more complex searches, specify a
   * query object that you've created.
   *
   * When the `search()` method assembles the query object, it always
   * performs a boolean OR (`should`) of field queries. In addition, it
   * performs filtering to limit the results to the appropriate `model`.
   *
   * If you supply the query object, be sure it includes filtering to
   * limit the results to the appropriate `model`.
   *
   * These options may be specified to control the query assembly:
   * *   `minimum_should_match` (string|number) - (default 1) to make the
   *       results more or less restrictive to the search term
   * *   `fields` (Array<string>) - (default is fields specified to
   *        `searchable()`) selects the fields on which to perform the
   *        full-text search
   * *   `match_query` (string) - (default is `match`) the ElasticSearch
   *       query to use for full-text search - may be `prefix` or
   *       `match_phrase` instead
   * *   `match_options` (Object) - additional ElasticSearch options for
   *       each field query
   * *   `aggs` (Object) - aggregations to add to the query
   * *   `filters` (Array<Object>) - additional ElasticSearch filter
   *       objects to restrict the query
   * *   `sort` array of sort fields
   *
   * These options may be specified to control pagination of results:
   * *   `skip` (number) - number of initial results to skip
   * *   `limit` (number) - (default 10) maximum number of results to return
   *
   * The ElasticSearch Query DSL documentation provides more detailed
   * descriptions of these options.
   *
   * @example
   *
   * Here are two calls to `search()` and the resulting queries:
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
   * @param  {string} model the model identity
   * @param  {string|Object} query search text string or query object
   * @param  {Object} opts options for {filters, limit, skip, sort}
   * @return {Array} result objects; also has `aggregations` and `total`
   *   properties
   */
  async search(model, query, opts={}) {
    let SD = await this._getSearchDocument(model)
    if (typeof query === 'string') query = this._buildQuery(model, query, opts)
    return this._retryLimit('Search', () => {
      return new Promise((resolve, reject) => {
        SD.query({where: query, limit: opts.limit, skip: opts.skip}, (err, response) => {
          if (err) return reject(err)
          let results = response.hits.hits.map(hit => Object.assign({_score: hit._score}, hit._source) )
          results.aggregations = response.aggregations
          results.total = response.hits.total
          resolve(results)
        })
      })
    })
  }

  /**
   * Count results of model for text matches.
   * @param  {string} model the model identity
   * @param  {string|Object} query search text string or query object
   * @param  {Object} opts options for {filters, limit, skip, sort}
   * @return {Array}  result objects
   */
  async count(model, query, opts={}) {
    let SD = await this._getSearchDocument(model)
    if (typeof query === 'string') query = this._buildQuery(model, query, opts)
    return this._retryLimit('Count', async () => { return await SD.count().where(query) })
  }


  /**
   * Reindex all of a model's documents. Different services concurrent request and queue limits are parameters
   * @param  {string} model the model identity
   * @param  {string} concurrent how many docs to concurrently process
   * @param  {string} interval ms to wait between doc chunks
   */
  async reindex(model, concurrent=1000, interval=100) {
    let SD = await this._getSearchDocument(model)
    // the actual configured ES index and collection for native call
    let index = SD.connections[SD.connection[0]].config.index
    let _type = SD.identity

    let count = 0, errors = 0

    let M = await storage.getModel(model)

    try {
      let body = {query: {term: {model}}}
      // delete-by-query apparently does its own retries
      await new Promise((resolve, reject) => {
        SD.native((err, client) => {
          if (err) { reject(err); return }
          client.deleteByQuery({index, body}, (err, response) => {
            if (err) { reject(err); return }
            if (response.errors) { reject(response.errors); return }
            resolve(response)
          })
        })
      })
      this.log.trace('Search reindex documents deleted', model)
    } catch (e) {
      this.log.trace("Search reindex destroy error", model, e.message)
    }

    for (;;) {
      let objs = await M.find().skip(count).limit(concurrent)
      if (objs.length === 0) break
      count += objs.length

      // bulk format is newline-separated action/data JSON strings
      let docs = await Promise.all(objs.map(obj => this._documentToIndex(model, obj)))
      let body = _.flatten(
        docs.map((d) => [{index: {_type, _id: d.id}}, d] )
      ).map(JSON.stringify).join("\n")

      // Although testing with ES 6.5 and _type deprecated since 5.x, validation error if `_type` is not provided
      //   the waterline-elasticsearch connection does set type too on non-native calls

      try {
        await this._retryLimit('Reindex', () => {
          return new Promise((resolve, reject) => {
            SD.native((err, client) => {
              if (err) { reject(err); return }
              client.bulk({index, body}, (err, response) => {
                if (err) { reject(err); return }
                if (response.errors) { reject(response.errors); return }
                resolve(response)
              })
            })
          })
        })
        this.log.trace('Bulk reindex progress', count, 'documents indexed')
      } catch (e) {
        errors += 1
        this.log.trace("Bulk reindex error", e.message)
      }

      if (objs.length < concurrent) break
      await timeout(interval)
    }
    this.log.trace('Bulk reindex complete', count, 'documents indexed', "with", errors, "errors")
  }

  _getSearchDocument(model) {
    return storage.getModel(this.modelConfig[model].searchdocument)
  }

  async _getModelAttributes(model) {
    let attributes = (await storage.getModel(model))._attributes
    let flattened = []
    for (let key in Object.keys(attributes))
      flattened.push(Object.assign({name: key}, attributes[key]))
    return flattened
  }

  async _searchDetail(req, res) {
    let model = req.params.model
    let M = await storage.getModel(model)
    let r = await M.findOne(req.param('id'))
    let opts = {
          [model]: r,
          inst: r,
          attributes: await this._getModelAttributes(model),
          title: 'View '+r.id
        }
    templater.render('search-'+model+'-detail', opts).then(res.send.bind(res))
  }

  async _searchResults(req, res) {
    let model = req.params.model
    let modelOpts = this.modelConfig[model]
    if (modelOpts === undefined) {
      res.status(404).send("Model Not Found")
      return
    }
    model = modelOpts.model // switch to canonical name (original may have been plural)
    let q = req.param('q') || {}
    let page = parseInt(req.param('page')) || 1
    let results = await this._handleSearch(req, res, model, q, page)
    let total = await this._handleCount(req, res, model, q)
    let opts = {
          [pluralize(model)]: results,
          insts: results,
          attributes: await this._getModelAttributes(model),
          title: 'Search Results for '+q,
          total,
          page,
          itemsPerPage: this.itemsPerPage,
          totalPages: Math.ceil(total / this.itemsPerPage),
          base: "/search/"+pluralize(model)+"?q="+encodeURIComponent(req.param('q'))+"&",
          req
        }
    templater.render('search-'+model+'-list', opts).then(res.send.bind(res))
  }

  _buildQuery(model, text, opts) {
    opts = Object.assign({match_query: 'match', minimum_should_match: 1, fields: this.modelConfig[model].fields}, opts)

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

    for (let field of opts.fields) {
      let m, o = {}
      o[opts.match_query] = {}

      if (opts.match_options) {
        m = Object.assign({query: text}, opts.match_options)
      } else {
        m = text
      }
      o[opts.match_query][field] = m
      query.query.bool.should.push(o)
    }
    if (opts.aggs) {
      query.aggs = opts.aggs
    }
    if (opts.filters) {
      query.query.bool.filter.push(...opts.filters)
    }
    if (opts.sort) {
      query.sort = opts.sort
    }

    return query
  }

  async _handleCount(req, res, model, q) {
      return this.count(model, q)
  }

  async _handleSearch(req, res, model, q, page) {
    let M = await storage.getModel(model)
    let limit = this.itemsPerPage
    let skip = (page - 1) * limit
    this.log.trace('Searching for', model, q)
    let results = await this.search(model, q, {limit, skip})
    let populate = this.modelConfig[model].populate
    let idq = M.find().where({id: _.pluck(results, 'id')})
    if (populate)
      idq.populate(populate)
    return idq

  }

  async _documentToIndex(model, doc) {
    doc = Object.assign({model}, doc)

    let opts = this.modelConfig[model]
    if (opts.processor) {
      doc = await opts.processor(doc)
    }
    return doc
  }

  async _handleCreate(model, doc) {
    if (!this.modelConfig[model]) return
    doc = await this._documentToIndex(model, doc)
    let SD = await this._getSearchDocument(model)
    try {
      await this._retryLimit('Create', () => SD.create(doc))
      this.log.trace('Search document created', model, doc.id)
    } catch (e) {
      this.log.trace("Search create error", model, doc, e.message)
    }
  }

  async _handleDestroy(model, doc) {
    if (!this.modelConfig[model]) return
    let SD = await this._getSearchDocument(model)
    try {
      await this._retryLimit('Destroy', () => SD.destroy().where(doc.id))
      this.log.trace('Search document deleted', model, doc.id)
    } catch (e) {
      this.log.trace("Search destroy error", model, doc.id, e.message)
    }
  }

  async _handleUpdate(model, doc) {
    if (!this.modelConfig[model]) return
    doc = await this._documentToIndex(model, doc)
    let SD = await this._getSearchDocument(model)
    try {
      await this._retryLimit('Update', () => SD.update(doc.id, doc))
      this.log.trace('Search document updated', model, doc.id)
    } catch (e) {
      this.log.trace("Search update error", model, doc, e.message)
    }
  }
}

let searcher = Searcher.getProxy()

export {
  Searcher as default,
  searcher,
  SearchDocument
}
