'use strict'

async function addOrUpdateCollection( collectionId, collectionObj, options = {} ) {
    try {
      let url, method
      if (options.elevate && collectionId) {
          delete collectionObj.settings
          delete collectionObj.metadata
          delete collectionObj.labels
      }
      if (collectionId) {
        url = `${STIGMAN.Env.apiBase}/collections/${collectionId}?elevate=${options.elevate ?? false}`
        method = 'PATCH'
      }
      else {
        url = `${STIGMAN.Env.apiBase}/collections?elevate=${options.elevate ?? false}`,
        method = 'POST'
      }
      let result = await Ext.Ajax.requestPromise({
        url: url,
        method: method,
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        params: {
          projection: ['owners', 'statistics', 'labels']
        },
        jsonData: collectionObj
      })
      let apiCollection = JSON.parse(result.response.responseText)
      // Refresh the curUser global
      await SM.GetUserObject()
      
      let event = collectionId ? 'collectionchanged' : 'collectioncreated'
      SM.Dispatcher.fireEvent( event, apiCollection, options )
      return apiCollection
    }
    catch (e) {
      alert (e.message)
    }
  }
  
  