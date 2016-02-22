/* 
* @Author: Mike Reich
* @Date:   2016-02-05 07:45:34
* @Last Modified 2016-02-21
*/
/**
 * The Searcher module enables easy searching of Nxus models using different adapters for Solr, ElasticSearch and others.
 * 
 * # Installation
 * 
 *     > npm install @nxus/searcher --save
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
 *      "adapter": {
 *        ...
 *        "searcher": "waterline-elasticsearch"
 *      },
 *      "connections": {
 *        ...
 *        "searcher: {
 *          "adapter": "searcher",
 *          "host": "<host address>",
 *          "port": 920,
 *          "log": "warning",
 *          "index": "searcher"
 *        }
 *      }
 *    }
 *
 * ## Register model
 * Now that the correct Storage adapters are configured, you'll need to tell Searcher which models you want to enable 
 * search using the `searchable` method. Searchable accepts an identity for a model which has already been registered.
 *
 *    app.get('searcher').searchable('users')
 *
 * By default, Searcher will look for a field named `title` or `name` to use as the search field. You can specify different, or 
 * multiple fields to search by specifying a second options parameter, with the `fields` key:
 *
 *    app.get('searcher').searchable('users', {fields: 'firstName'})
 *    app.get('searcher').searchable('users', {fields: ['firstName', 'lastName']})
 *
 * ## Routes
 * Based on the model identify, Searcher will create the following routes
 *
 *     /<model>/search
 *
 * which accepts a search parameter `q`. So to search for the term 'pizza':
 *
 *     /<model>/search?q=pizza
 *
 * The search wil return a list of results using the views below.
 * 
 * ## Views
 * Searcher will automatically use the `@nxus/base-ui` views for any model that is searchable (if they exist).
 *
 * 1. view-<model>-list: the list view used to display search results.
 * 1. view-<model>-detail: the detail view linked to from the list view.
 *
 * Alternatively, you can provide search specific views to be used instead:
 *
 * 1. search-<model>-list: the list view for returned search results.
 * 1. search-<model>-detail: the detail view for an individual search result.
 * 
 * # API
 * 
 */

'use strict';

import SearchDocument from './models/searchDocument.js'
import _ from 'underscore'
import Promise from 'bluebird'

/**
 * The Search class enables automated searching of models using different adapters.
 */
export default class Searcher {
  constructor(app) {
    this.app = app
    this.storage = this.app.get('storage')
    this.router = this.app.get('router')
    this.modelConfig = {}

    this.app.get('searcher').use(this)
    .gather('searchable')

    this.storage.model(SearchDocument)
  }

  /**
   * Register a model to be searchable.
   * @param  {string} model the model identity
   * @param  {Object} opts  An optional hash of options.
   */
  searchable(model, opts = {}) {
    this.app.log.debug('Registering searchable', model, opts)
    if(!opts.fields) opts.fields = ['name', 'title']
    this.modelConfig[model] = opts

    this.storage.on('model.create', this._handleCreate.bind(this))
    this.storage.on('model.update', this._handleUpdate.bind(this))  
    this.storage.on('model.destroy', this._handleDestroy.bind(this))  

    this.router.route('get', '/search/'+model, (req, res) => {
      Promise.try(() => {return this._handleSearch(req, res, model)})
      .then(res.send.bind(res))
    })
  }

  _handleSearch(req, res, model) {
    if(!this.modelConfig[model]) return res.status(404)
    let q = req.param('q') || {}
    this.app.log.debug('Searching for', model, q)
    return this.app.get('storage').getModel('searchdocument').then((SD) => {
      let query = {model: model}
      let opts = this.modelConfig[model]
      if(opts.fields.length > 1) {
        query['or'] = []
        for(let field in opts.fields) {
          var o = {}
          o[field] = q
          query.or.push(o)
        }
      } else {
        query[opts.fields[0]] = q
      }
      this.app.log.debug('Performing query', model, query)
      return SD.find().where(query)
    })
  }

  _handleCreate(model, doc) {
    if(!this.modelConfig[model]) return
    doc.model = model
    this.app.log.debug('Creating search doc for', doc)
    return this.app.get('storage').getModel('searchdocument').then((SD) => {
      this.app.log.debug('Creating search doc', doc)
      SD.create(doc).then(() => this.app.log.debug('Search document created'))
      .catch((e) => this.app.log.error('Could not create search doc', e))
    })
  }

  _handleDestroy(model, doc) {
    if(!this.modelConfig[model]) return
    return this.app.get('storage').getModel('searchdocument').then((SD) => {
      this.app.log.debug('Deleting search doc', doc)
      SD.destroy().where(doc.id).then(() => this.app.log.debug('Search document deleted'))
      .catch((e) => this.app.log.error('Could not delete search doc', e))
    })
  }

  _handleUpdate(model, doc) {
    if(!this.modelConfig[model]) return
    return this.app.get('storage').getModel('searchdocument').then((SD) => {
      this.app.log.debug('Updating search doc', doc)
      SD.update(doc.id, doc).then(() => this.app.log.debug('Search document updated'))
      .catch((e) => this.app.log.error('Could not update search doc', e))
    })
  }
} 