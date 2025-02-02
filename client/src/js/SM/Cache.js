Ext.ns('SM.Cache')

SM.Cache.CollectionMap = new Map()

SM.Cache.getCollections = async function () {
  const result = await Ext.Ajax.requestPromise({
    url: `${STIGMAN.Env.apiBase}/collections`,
    method: 'GET',
    params: {
      projection: 'labels'
    }
  })
  const apiCollections = JSON.parse(result.response.responseText)
  return SM.Cache.seedCollections(apiCollections)
}

SM.Cache.updateCollectionLabels = async function (collectionId) {
  const collection = SM.Cache.CollectionMap.get(collectionId)
  let result = await Ext.Ajax.requestPromise({
    url: `${STIGMAN.Env.apiBase}/collections/${collectionId}/labels`,
    method: 'GET'
  })
  collection.labels = JSON.parse(result.response.responseText)
  collection.labelMap = new Map()
  for (const label of collection.labels) {
    collection.labelMap.set(label.labelId, label)
  }
  return collection.labelMap
}

SM.Cache.updateCollectionMetadataKey = function(collectionId, key, value) {
  const collection = SM.Cache.CollectionMap.get(collectionId)
  if (collection) {
    collection.metadata[key] = value
  }
}

SM.Cache.refreshCollection = async function (collectionId) {
  let result = await Ext.Ajax.requestPromise({
    url: `${STIGMAN.Env.apiBase}/collections/${collectionId}`,
    method: 'GET',
    params: {
      projection: 'labels'
    }
  })
  const collectionMap = SM.Cache.seedCollections([JSON.parse(result.response.responseText)])
  return collectionMap.get(collectionId)
}

SM.Cache.updateCollection = function (apiCollection) {
  let collectionObj = SM.Cache.CollectionMap.get(apiCollection.collectionId)
  if (collectionObj) {
    collectionObj = {...collectionObj, ...apiCollection}
    if (apiCollection.labels) {
      const labelMap = new Map()
      for (const label of apiCollection.labels) {
        labelMap.set(label.labelId, label)
      }
      collectionObj.labelMap = labelMap
    }
    SM.Cache.CollectionMap.set(apiCollection.collectionId, collectionObj)
  }
  else {
    SM.Cache.seedCollections([apiCollection])
  }
}

SM.Cache.seedCollections = function (apiCollections) {
  for (const collection of apiCollections) {
    const labelMap = new Map()
    for (const label of collection.labels) {
      labelMap.set(label.labelId, label)
    }
    SM.Cache.CollectionMap.set(collection.collectionId, { labelMap, ...collection })
  }
  return SM.Cache.CollectionMap
}

SM.Dispatcher.addListener('collectioncreated', function( apiCollection, options) {
  SM.Cache.seedCollections([apiCollection])
})

SM.Dispatcher.addListener('collectionchanged', function( apiCollection, options) {
  SM.Cache.updateCollection(apiCollection)
})

SM.Dispatcher.addListener('collectiondeleted', function( collectionId) {
  SM.Cache.CollectionMap.delete(collectionId)
})
SM.Dispatcher.addListener('labelcreated', function (collectionId, label) {
  const collection = SM.Cache.CollectionMap.get(collectionId)
  collection.labelMap.set(label.labelId, label)
  collection.labels = Array.from(collection.labelMap.values()).sort((a,b) => a.name.localeCompare(b.name))
})

SM.Dispatcher.addListener('labelchanged', function (collectionId, label) {
  const collection = SM.Cache.CollectionMap.get(collectionId)
  collection.labelMap.set(label.labelId, label)
  collection.labels = Array.from(collection.labelMap.values()).sort((a,b) => a.name.localeCompare(b.name))
})

SM.Dispatcher.addListener('labeldeleted', function (collectionId, labelId) {
  const collection = SM.Cache.CollectionMap.get(collectionId)
  collection.labelMap.delete(labelId)
  collection.labels = Array.from(collection.labelMap.values()).sort((a,b) => a.name.localeCompare(b.name))
})

SM.Dispatcher.addListener('importoptionschanged', function (collectionId, value) {
  SM.Cache.updateCollectionMetadataKey(collectionId, 'importOptions', value)
})
