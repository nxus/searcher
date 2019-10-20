/* globals beforeAll: false, afterAll: false, describe: false, it: false, expect: false, tester: false, storage: false */
import sinon from 'sinon'

let searcher = tester.getApplicationModule('searcher')

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function processor(doc) {
  doc.lower_name = doc.name.toLowerCase()
  return doc
  
}
processor = sinon.spy(processor)

function reprocessor(doc) {
  doc.upper_name = doc.name.toUpperCase()
  return doc
  
}
reprocessor = sinon.spy(reprocessor)

describe('Integration', () => {
  describe("searchable", () => {
    it("registers model", async () => {
      await searcher.searchable('test-model')
      
      expect(searcher._instance.modelConfig).toHaveProperty('test-model', {
        fields: ['name', 'title', 'description'],
        model: 'test-model',
        searchdocument: 'searchdocument'
      })

      expect(searcher._instance._searchDocuments).toHaveProperty('', 'searchdocument')
    })
    it("registers model with processor", async () => {
      await searcher.searchable('test-model2', {processor})
      
      expect(searcher._instance.modelConfig['test-model2']).toHaveProperty('processor')

    })

  })

  describe("documents", () => {
    it("creates document", async () => {
      let model = await storage.getModel('test-model')
      let val = {name: 'First Model'}
      await model.create(val)
      // timeout and refresh for model events not awaited
      await timeout(200)
      await tester.searcherRefresh()

      let count = await searcher.count('test-model', 'First')
      expect(count).toEqual(1)
      let res = await searcher.search('test-model', 'First')
      expect(res.total).toEqual(1)
      expect(res[0].model).toEqual('test-model')
      expect(res[0].name).toEqual(val.name)
    })
    it("creates document with processing", async () => {
      let model = await storage.getModel('test-model2')
      let val = {name: 'Test Model'}
      await model.create(val)
      // timeout and refresh for model events not awaited
      await timeout(200)
      await tester.searcherRefresh()

      expect(processor.callCount).toEqual(1)
      let res = await searcher.search('test-model2', 'Test')
      expect(res.total).toEqual(1)
      expect(res[0].model).toEqual('test-model2')
      expect(res[0].lower_name).toEqual(val.name.toLowerCase())
    })

    it("updates document", async () => {
      let model = await storage.getModel('test-model')
      let m = await model.findOne({name: 'First Model'})
      m.name = 'Other Model'
      await m.save()
      // timeout and refresh for model events not awaited
      await timeout(200)
      await tester.searcherRefresh()

      // new document is found
      let res = await searcher.search('test-model', 'Other')
      expect(res.total).toEqual(1)
      expect(res[0].model).toEqual('test-model')
      expect(res[0].name).toEqual(m.name)
      // original document is not found
      res = await searcher.search('test-model', 'First')
      expect(res.total).toEqual(0)
    })

    it("deletes document", async () => {
      let model = await storage.getModel('test-model')
      let m = await model.findOne({name: 'Other Model'})
      await model.destroy(m.id)
      // timeout and refresh for model events not awaited
      await timeout(200)
      await tester.searcherRefresh()
      
      let res = await searcher.search('test-model', 'Model')
      expect(res.total).toEqual(0)
    })
    
  })

  describe("reindex", () => {
    it("reindexes and refreshes all model processing", async () => {
      await searcher.searchable('test-model2', {processor: reprocessor})
      await searcher.reindex('test-model2')
      await timeout(200)
      await tester.searcherRefresh()
      
      let res = await searcher.search('test-model2', 'Model')
      expect(res.total).toEqual(1)
      expect(res[0].upper_name).toEqual('TEST MODEL')
      expect(reprocessor.callCount).toEqual(1)
        
    })    
  })

  describe("errors", () => {
    let queryStub
    afterEach(() => {
      queryStub.restore()
    })
    it("retries on 429 four times", async () => {
      let err = {originalError: {statusCode: 429, message: "Too Many Requests"}}
      queryStub = sinon.stub(storage._instance.connections.searcher._adapter, 'query', (conn, coll, options, cb) => {
        cb(err)
      })
       
      try {
        await searcher.search('test-model2', 'Test')
      } catch (e) {
        expect(e).toEqual(err)
      }
      expect(queryStub.callCount).toEqual(4)
    })
    it("throws error for error", async () => {
      let err = {originalError: {statusCode: 400, message: "Bad Request"}}
      queryStub = sinon.stub(storage._instance.connections.searcher._adapter, 'query', (conn, coll, options, cb) => {
        cb(err)
      })
       
      try {
        await searcher.search('test-model2', 'Test')
      } catch (e) {
        expect(e).toEqual(err)
      }
      expect(queryStub.callCount).toEqual(1)
    })
    
  })
})
