async function addCollectionManager( collectionId, collectionName ) {
	try {
		let collectionPanel = new SM.CollectionPanel({
			collectionId: collectionId,
			region: 'north',
			padding: '10px 10px 10px 10px',
			border: false,
			split: true,
			layout: 'fit',
			height: 300
		})
		let grantGrid = new SM.UserGrantsGrid({
			collectionId: collectionId,
			url: `${STIGMAN.Env.apiBase}/collections/${collectionId}`,
			baseParams: {
				elevate: curUser.canAdmin,
				projection: 'grants'
			},
			title: 'Grants',
			border: false,
			region: 'center'
		})
		let assetGrid = new SM.CollectionAssetGrid({
			collectionId: collectionId,
			url: `${STIGMAN.Env.apiBase}/assets`,
			title: 'Assets',
			region: 'north',
			split: true,
			height: '50%'
		})
		let stigGrid = new SM.CollectionStigsGrid({
			collectionId: collectionId,
			url: `${STIGMAN.Env.apiBase}/collections/${collectionId}/stigs`,
			title: 'STIGs',
			region: 'center'
		})
		let thisTab = Ext.getCmp('reviews-center-tab').add({
			id: `${collectionId}-collection-manager-tab`,
			iconCls: 'sm-collection-icon',
			title: `${collectionName} : Configuration`,
			closable: true,
			layout: 'border',
			items: [
				{
					region: 'west',
					width: 500,
					split: true,
					border: true,
					layout: 'border',
					items: [
						collectionPanel,
						grantGrid 
					]
				},
				{
					region: 'center',
					layout: 'border',
					items: [
						assetGrid,
						stigGrid
					]
	
				}
			]
		})
	
		let result = await Ext.Ajax.requestPromise({
			url: `${STIGMAN.Env.apiBase}/collections/${collectionId}`,
			params: {
				elevate: curUser.canAdmin,
				projection: 'grants'
			},
			method: 'GET'
		})
		let apiCollection = JSON.parse(result.response.responseText)
	
		thisTab.show();
		collectionPanel.getForm().setValues(apiCollection)
		grantGrid.getStore().loadData(apiCollection.grants.map( g => ({
			userId: g.user.userId,
			username: g.user.username,
			accessLevel: g.accessLevel
		})))
		assetGrid.getStore().load()
		stigGrid.getStore().load()
	}
	catch( e) {
		throw (e)
	}

}