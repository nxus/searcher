/* 
* @Author: Mike Reich
* @Date:   2016-02-05 07:45:34
* @Last Modified 2016-04-10
*/
/**
 *
 * [![Build Status](https://travis-ci.org/nxus/searcher.svg?branch=master)](https://travis-ci.org/nxus/searcher)
 * 
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
 *          "index": "searcher"
 *        }
 *      }
 *    }
 *
 * ## Register model
 * Now that the correct Storage adapters are configured, you'll need to tell Searcher which models you want to enable 
 * search using the `searchable` method. Searchable accepts an identity for a model which has already been registered.
 *
 *    app.get('searcher').searchable('user')
 *
 * By default, Searcher will look for a field named `title` or `name` to use as the search field. You can specify different, or 
 * multiple fields to search by specifying a second options parameter, with the `fields` key:
 *
 *    app.get('searcher').searchable('user', {fields: 'firstName'})
 *    app.get('searcher').searchable('user', {fields: ['firstName', 'lastName']})
 *
 * ## Routes
 * Based on the model identify, Searcher will create the following routes
 *
 *     /users/search
 *
 * which accepts a search parameter `q`. So to search for the term 'pizza':
 *
 *     /users/search?q=mike
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

import SearchDocument from './models/searchDocument.js'
import _ from 'underscore'
import Promise from 'bluebird'
import pluralize from 'pluralize'

/**
 * The Search class enables automated searching of models using different adapters.
 */
export default class Searcher {
  constructor(app) {
    this.app = app
    this.storage = this.app.get('storage')
    this.router = this.app.get('router')
    this.modelConfig = {}

    this.app.before('init', () => {
      this._setDefaultConfig(app)
    })

    this.app.get('searcher').use(this)
    .gather('searchable')

    this.storage.model(SearchDocument)
  }

  _setDefaultConfig(app) {
    var conf = app.config.storage
    if(!conf.adapters) conf.adapters = {}
    if(!conf.connections) conf.connections = {}
    if(!conf.adapters.searcher) {
      conf.adapters.searcher = "waterline-elasticsearch"
      conf.connections.searcher = {
         "adapter": "searcher",
         "host": app.config.host+":9200",
         "log": "warning",
         "index": "searcher"
      }
      app.writeDefaultConfig('storage', conf)
    }
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

    this.app.get('base-ui').getViewModel(model).then((viewModel) => {
      if(!viewModel) {
        return this.router.route('get', '/search/'+pluralize(model)+"/:id", (req, res) => {
          return this.app.get('templater').getTemplate('search-'+model+'-detail').then((template) => {
            if(template) {
              template = 'search-'+model+'-detail'
            } else {
              template = __dirname+"/../views/detail.ejs"
            }
            return this.app.get('storage').getModel(model).then((M) => {
              return M.findOne(req.param('id')).then((r) => {
                let opts = {}
                opts[model] = r
                opts.inst = r
                opts.attributes = _.map(_.keys(M._attributes), (k) => {let ret = M._attributes[k]; ret.name = k; return ret})
                console.log('template', template, opts)
                opts.title = 'View '+r.id
                return this.app.get('templater').renderPartial(template, 'page', opts).then(res.send.bind(res))
              })
            })
          })
        })
      }
    })

    this.router.route('get', '/search/'+pluralize(model), (req, res) => {
      let page = parseInt(req.param('page')) || 1
      return this._handleSearch(req, res, model).then((results) => {
        return this._handleCount(req, res, model).then((total) => {
          let totalPages = total > 0 ? Math.ceil(total/10) : 0
          console.log('totalpages', totalPages)
          let opts = {
            total,
            page,
            itemsPerPage: 10,
          }
          console.log(opts)
          opts[pluralize(model)] = results
          opts.title = 'Search Results for '+req.param('q')
          return this.app.get('templater').getTemplate('search-'+model+'-list').then(([template]) => {
            return this.app.get('storage').getModel(model).then((M) => {
              opts.attributes = _.map(_.keys(M._attributes), (k) => {let ret = M._attributes[k]; ret.name =k; return ret})
              opts.insts = results
              opts.base = "/search/"+pluralize(model)+"?q="+encodeURIComponent(req.param('q'))+"&"
              opts.req = req
              if(template) {
                return this.app.get('templater').renderPartial('search-'+model+'-list', 'page', opts).then(res.send.bind(res))
              } else {
                return this.app.get('base-ui').getViewModel(model).then((viewModel) => {
                  if(viewModel) {
                    return viewModel.list(req, res, opts).bind(res.send.bind(res))
                  } else {
                    return this.app.get('templater').renderPartial(__dirname+"/../views/list.ejs", 'page', opts).then(res.send.bind(res))
                  }
                })
              }
            })
          })
        })
      })
    })
  }

  _handleCount(req, res, model) {
    if(!this.modelConfig[model]) return res.status(404)
    let q = req.param('q') || {}
    this.app.log.debug('Searching for', model, q)
    return this.app.get('storage').getModel(['searchdocument', model]).spread((SD, M) => {
      let query = {model: model}
      let opts = this.modelConfig[model]
      if(opts.fields.length > 1) {
        query['or'] = []
        for(let field of opts.fields) {
          var o = {}
          o[field] = q
          query.or.push(o)
        }
      } else {
        query[opts.fields[0]] = q
      }
      this.app.log.debug('Performing count query', model, query)
      return SD.count().where(query)
    })
  }

  _handleSearch(req, res, model) {
    if(!this.modelConfig[model]) return res.status(404)
    let q = req.param('q') || {}
    let limit = 10
    let skip = ((parseInt(req.param('page')) || 1)-1)*limit
    this.app.log.debug('Searching for', model, q)
    return this.app.get('storage').getModel(['searchdocument', model]).spread((SD, M) => {
      let query = {model: model}
      let opts = this.modelConfig[model]
      if(opts.fields.length > 1) {
        query['or'] = []
        for(let field of opts.fields) {
          var o = {}
          o[field] = q
          query.or.push(o)
        }
      } else {
        query[opts.fields[0]] = q
      }
      this.app.log.debug('Performing query', model, query)
      return SD.find().where(query).skip(skip).limit(limit).then((ids) => {
        ids = _.pluck(ids, 'id')
        console.log('ids', ids)
        let idq = M.find().where({id: ids})
        if(opts.populate)
          idq.populate(opts.populate)
        return idq
      })
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