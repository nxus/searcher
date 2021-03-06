# nxus-searcher

<!-- Generated by documentation.js. Update this documentation by updating the source code. -->

### 

[![Build Status](https://travis-ci.org/nxus/searcher.svg?branch=master)](https://travis-ci.org/nxus/searcher)

The Searcher module enables easy searching of Nxus models using ElasticSearch.

## Installation

    > npm install nxus-searcher --save

## Usage

### Configuration

The Searcher module depends on @nxus/storage.  The first step is adding and configuring the search adapter in .nxusrc (The following config is default and added for you, see the Optional Configuration section below for common additions):

   "storage": {
     "adapters": {
       ...
       "searcher": "waterline-elasticsearch"
     },
     "connections": {
       ...
       "searcher: {
         "adapter": "searcher",
         "host": "<host address>:9200",
         "log": "warning",
         "index": "searcher",
         "mappings": {"searchdocument": {"properties": {"id": {"type":"keyword"}, "model":{"type": "keyword"}}}}
       }
     }
   }

Some ES providers like Bonsai limit the number of concurrent reads/writes, and respond with a 429 error over
limit. By default searcher catches these errors and retries with an exponential delay. You can configure the
delay nultiplier (ms) and maximum number of attempts:

  "searcher": {
    "retryDelay": 200,
    "retryAttempts": 4
  }

### Register model

Now that the correct Storage adapters are configured, you'll need to tell Searcher which models you want to enable
search using the `searchable` method. Searchable accepts an identity for a model which has already been registered.

   import {searcher} from 'nxus-searcher'
   searcher.searchable('user')

By default, Searcher will look for a field named `title`, `name`, or `description` to use as the search field. You can specify different, or
multiple fields to search by specifying a second options parameter, with the `fields` key:

   searcher.searchable('user', {fields: 'firstName'})
   searcher.searchable('user', {fields: ['firstName', 'lastName']})

You can also specify a processor function (Promise or sync) to modify
the  document before indexing - if there are elasticsearch-incompatible fields, etc

   searcher.searchable('user', {processor: (doc) => {return doc} })

### Optional Configuration

Connections in the `storage` config correspond to ElasticSearch indexes. In addition to the `index` name, you may configure
the `mappings` and `analysis` sections here to control ElasticSearch's index and query behavior.

If you provide your own mapping config, it is required that you specify the `id` and `model` fields as `keywords`:
    "mappings": {"searchdocument": {"properties": {"id": {"type":"keyword"}, "model":{"type": "keyword"}}}}

An example use for specifying both mapping and analysis is to provide autocomplete-style ngram indexing on some fields.

         "mappings": {
           "searchdocument": {
             {"properties": {"id": {"type":"keyword"}, "model":{"type": "keyword"},
                "name": {
                  "type": "text",
                  "analyzer": "autocomplete",
                  "search_analyzer": "standard"
                }
             }},
           }
         },
         "analysis": {
           "filter": {
             "autocomplete_filter": {
               "type": "edge_ngram",
               "min_gram": 1,
               "max_gram": 20
             }
           },
           "analyzer": {
             "autocomplete": {
               "type": "custom",
               "tokenizer": "standard",
               "filter": [
                 "lowercase",
                 "autocomplete_filter"
               ]
             }
           }
         },

### Multiple Search Indexes

By default, you may index many different storage model documents to one ElasticSearch index, for when you don't
need separate config to handle field differences between models.

If you need to maintain separate search indexes, you first need to add a new connection to `.nxusrc` based on the
default connection fields and mapping listed in Configuration above.

When registering a model as searchable, you may pass an `index` option to specify a which connection/index to use

 \`searcher.searchable('model', {index: 'alternate'})

### Queries

The `searcher.search(model, query, opts)` method searches a model for
text matches. It accepts either a text string as the `query`
parameter, or an ElasticSearch query object. For most searches, you
can provide a text string and let it assemble a query object. For
more complex searches, you can define your own query object. (The
`searcher.count(model, query, opts)` method works the same way.)

### Routes

Based on the model identify, Searcher will create the following routes

    /search/user

which accepts a search parameter `q`. So to search for the term 'pizza':

    /search/user?q=mike

The search wil return a list of results using the views below.

### Views

You can provide search specific views to be used for search results:

1.  search-user-list: the list view for returned search results.
2.  search-user-detail: the detail view for an individual search result.

Alternatively, if no search templates are found, searcher will automatically use the `@nxus/base-ui` views for any model
that is searchable (if they exist).

1.  view-user-list: the list view used to display search results.
2.  view-user-detail: the detail view linked to from the list view.

Finally, searcher will use default list/detail views if no other templates are found.

## API

### Searcher

**Extends NxusModule**

The Search class enables automated searching of models using different adapters.

**Parameters**

-   `opts`   (optional, default `{}`)

#### searchable

Register a model to be searchable.

These options properties may be specified:

-   `fields` (string|Array<string>) - fields to search, specified
      as a single field name or an array of field names
      (default setting is `['title', 'name', 'description']`)
-   `index` (string) - name of connection/index to use for search
-   `processor` (Function) - a processor function to modify
      documents before indexing; passed a document instance, it
      should return the modified instance (sync) or a Promise that
      resolves to the modified instance (async)
-   `populate` - a Waterline `populate()` parameter, used to
      populate document instances for the search results list view

A typical use for the processor function is to remove fields that
are incompatible with Elasticsearch (e.g. polymorphic fields).

**Parameters**

-   `model` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** the model identity
-   `opts` **[Object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object)** options (optional, default `{}`)

#### search

Search a model for text matches.

The `query` parameter is either a text string or an ElasticSearch
query object. Specify a text string to let the `search()` method
assemble the query object; for more complex searches, specify a
query object that you've created.

When the `search()` method assembles the query object, it always
performs a boolean OR (`should`) of field queries. In addition, it
performs filtering to limit the results to the appropriate `model`.

If you supply the query object, be sure it includes filtering to
limit the results to the appropriate `model`.

These options may be specified to control the query assembly:

-   `minimum_should_match` (string|number) - (default 1) to make the
      results more or less restrictive to the search term
-   `fields` (Array<string>) - (default is fields specified to
       `searchable()`) selects the fields on which to perform the
       full-text search
-   `match_query` (string) - (default is `match`) the ElasticSearch
      query to use for full-text search - may be `prefix` or
      `match_phrase` instead
-   `match_options` (Object) - additional ElasticSearch options for
      each field query
-   `aggs` (Object) - aggregations to add to the query
-   `filters` (Array<Object>) - additional ElasticSearch filter
      objects to restrict the query
-   `sort` array of sort fields

These options may be specified to control pagination of results:

-   `skip` (number) - number of initial results to skip
-   `limit` (number) - (default 10) maximum number of results to return

The ElasticSearch Query DSL documentation provides more detailed
descriptions of these options.

**Parameters**

-   `model` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** the model identity
-   `query` **([string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) \| [Object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object))** search text string or query object
-   `opts` **[Object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object)** options for {filters, limit, skip, sort} (optional, default `{}`)

**Examples**

````javascript
    Here are two calls to `search()` and the resulting queries:

    `searcher.search('test-model', 'search term')`
     ```
          query: {
            bool: {
              minimum_should_match: 1,
              should: [
                {match: {name: "search term"}},
                {match: {title: "search term"}},
                {match: {description: "search term"}},
              ],
              filter: [
                {term: {model: "test-model"}}
              ]
            }
          }
     ```

     ```
     searcher.search('test-model', 'search term', {
       minimum_should_match: "50%",
       fields: ['name', 'lastName'],
       match_query: "match_phrase",
       match_options: {analyzer: 'my-analyzer'},
       filters: [{term: {type: 'person'}}],
       sort: [{name: 'desc'}, 'lastName']
     })
     ```
     ```
          query: {
            bool: {
              minimum_should_match: "50%",
              should: [
                {match_phrase: {name: "search term", analyzer: 'my-analyzer'}},
                {match_phrase: {lastName: "search term", analyzer: 'my-analyzer'}},
              ],
              filter: [
                {term: {model: "test-model"}},
                {term: {type: "person"}}
              ]
            }
          },
          sort: [{name: 'desc'}, 'lastName']
     ```
````

Returns **[Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array)** result objects; also has `aggregations` and `total`
  properties

#### count

Count results of model for text matches.

**Parameters**

-   `model` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** the model identity
-   `query` **([string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) \| [Object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object))** search text string or query object
-   `opts` **[Object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object)** options for {filters, limit, skip, sort} (optional, default `{}`)

Returns **[Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array)** result objects

#### reindex

Reindex all of a model's documents. Different services concurrent request and queue limits are parameters

**Parameters**

-   `model` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** the model identity
-   `concurrent` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** how many docs to concurrently process (optional, default `1000`)
-   `interval` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** ms to wait between doc chunks (optional, default `100`)
