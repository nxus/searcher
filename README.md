# @nxus/searcher

## 

[![Build Status](https://travis-ci.org/nxus/searcher.svg?branch=master)](https://travis-ci.org/nxus/searcher)

The Searcher module enables easy searching of Nxus models using different adapters for Solr, ElasticSearch and others.

## Installation

    > npm install @nxus/searcher --save

## Usage

### Configuration

The Searcher module depends on @nxus/storage.  The first step is adding and configuring the search adapter you'd like to use.
For example, if we want to enable ElasticSearch, we first install the waterline-elasticsearch adapter, then setup the configuration 
options in the Storage config.

> npm install waterline-elasticsearch --save

then add to package.json

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
         "index": "searcher"
       }
     }
   }

### Register model

Now that the correct Storage adapters are configured, you'll need to tell Searcher which models you want to enable 
search using the `searchable` method. Searchable accepts an identity for a model which has already been registered.

   app.get('searcher').searchable('user')

By default, Searcher will look for a field named `title` or `name` to use as the search field. You can specify different, or 
multiple fields to search by specifying a second options parameter, with the `fields` key:

   app.get('searcher').searchable('user', {fields: 'firstName'})
   app.get('searcher').searchable('user', {fields: ['firstName', 'lastName']})

### Routes

Based on the model identify, Searcher will create the following routes

    /users/search

which accepts a search parameter `q`. So to search for the term 'pizza':

    /users/search?q=mike

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

## Searcher

The Search class enables automated searching of models using different adapters.

### searchable

Register a model to be searchable.

**Parameters**

-   `model` **[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)** the model identity
-   `opts` **[Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)=(default {})** An optional hash of options.
