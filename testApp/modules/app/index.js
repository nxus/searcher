import {NxusModule} from 'nxus-core'

import {storage, BaseModel} from 'nxus-storage'

var TestModel = BaseModel.extend({
  identity: 'test-model',
  attributes: {
    name: 'string'
  }
})
var TestModel2 = BaseModel.extend({
  identity: 'test-model2',
  attributes: {
    name: 'string'
  }
})

export default class App extends NxusModule {
  constructor() {
    super()

    storage.model(TestModel)
    storage.model(TestModel2)
  }
}
