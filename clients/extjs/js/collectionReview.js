/*
$Id: collectionReview.js 885 2018-02-20 16:26:08Z bmassey $
*/


async function addCollectionReview ( leaf, selectedRule, selectedAsset ) {
	try {
		// 'selectedRule' is optional
		/* Example of 'leaf': 
			leaf = {
				id: "1-Acitve_Directory_Domain-stigs-stig-node"
				report: "stig"
				revId: "IE8-1-10"
				benchmarkId: "IE8"
				collectionId: "1"
				stigName: "APACHE_SERVER_2.2_WINDOWS"
			}
		*/

		// Classic compatability. Remove after modernization
		if (leaf.stigRevStr) {
			let match = leaf.stigRevStr.match(/V(\d+)R(\d+)/)
			leaf.revId = `${leaf.benchmarkId}-${match[1]}-${match[2]}`
		}
		var idAppend = '-collection-' + leaf.collectionId + '-' + leaf.benchmarkId.replace(".","_");
		var unsavedChangesPrompt = 'You have modified your review. Would you like to save your changes?';

		/******************************************************/
		// 'Global' pkgAssetsTpl object for reviewsGrid
		/******************************************************/
		let result = await Ext.Ajax.requestPromise({
			url: `${STIGMAN.Env.apiBase}/assets/`,
			params: {
				collectionId: leaf.collectionId,
				benchmarkId: leaf.benchmarkId
			},
			method: 'GET'
		})
		let pkgAssetsApi = JSON.parse(result.response.responseText)
		let pkgAssets = pkgAssetsApi.map( pkgAsset => ({
			assetId: pkgAsset.assetId,
			assetName: pkgAsset.name,
			result: null,
			resultComment: null,
			action: null,
			actionComment: null,
			autoResult: null,
			userId: null,
			username: null,
			ts: null,
			status: null
		}))

		/******************************************************/
		// START Group Grid
		/******************************************************/
		var groupFields = Ext.data.Record.create([
			{	
				name:'oCnt',
				type: 'int',
				mapping: 'counts.results.fail'
			},{	
				name:'nfCnt',
				type: 'int',
				mapping: 'counts.results.pass'
			},{	
				name:'naCnt',
				type: 'int',
				mapping: 'counts.results.notapplicable'
			},{	
				name:'nrCnt',
				type: 'int',
				mapping: 'counts.results.notchecked'
			},{	
				name:'approveCnt',
				type: 'int',
				mapping: 'counts.statuses.accepted'
			},{	
				name:'rejectCnt',
				type: 'int',
				mapping: 'counts.statuses.rejected'
			},{	
				name:'readyCnt',
				type: 'int',
				mapping: 'counts.statuses.submitted'
			},{	
				name:'groupId',
				type: 'string',
				sortType: sortGroupId
			},{	
				name:'ruleId',
				type: 'string'
			},{
				name:'groupTitle',
				type: 'string'
			},{
				name:'ruleTitle',
				type: 'string'
			},{
				name:'severity',
				type:'string'
			},{
				name:'autoCheckAvailable',
				type:'boolean'
			}
		]);


		var groupStore = new Ext.data.JsonStore({
			proxy: new Ext.data.HttpProxy({
				url: `${STIGMAN.Env.apiBase}/collections/${leaf.collectionId}/checklists/${leaf.benchmarkId}/latest`,
				method: 'GET'
			}),
			root: '',
			id: 'groupStore' + idAppend,
			fields: groupFields,
			idProperty: 'ruleId',
			sortInfo: {
				field: 'groupId',
				direction: 'ASC' // or 'DESC' (case sensitive for local sorting)
			},
			listeners: {
				load: function (store,records,options) {
					var ourGrid = Ext.getCmp('groupGrid' + idAppend);
					
					// Preselection
					if (options.preselect !== undefined) {
						if (options.preselect.ruleId !== undefined) {
							var index = store.find('ruleId',options.preselect.ruleId);
							ourGrid.getSelectionModel().selectRow(index);
							ourGrid.getView().focusRow(index);
						} else {
							ourGrid.getSelectionModel().selectFirstRow();
						}
					} else {
						ourGrid.getSelectionModel().selectFirstRow();
					}
					// Filter the store based on current filterState
					if (ourGrid.filterState != 'All') {
						store.filter('checkType',ourGrid.filterState);
					}
					
					Ext.getCmp('groupGrid-totalText' + idAppend).setText(getStatsString(store));
				},
				clear: function(){
					Ext.getCmp('groupGrid-totalText' + idAppend).setText('0 checks');
				},
				update: function(store) {
					Ext.getCmp('groupGrid-totalText' + idAppend).setText(getStatsString(store));
				},
				datachanged: function(store) {
					Ext.getCmp('groupGrid-totalText' + idAppend).setText(getStatsString(store));
				},
				exception: function(misc) {
					var ourView = groupGrid.getView();
					var response = misc.events.exception.listeners[1].fn.arguments[4];
					if (response.status != 0) {
						ourView.emptyText = 'Load failed: ' + response.responseText;
					} else {
						ourView.emptyText = 'HTTP Server Error: ' + response.statusText;
					}
					ourView.refresh();
				}
			}
		});

		/******************************************************/
		// Group grid menus
		/******************************************************/
		var groupChecklistMenu = new Ext.menu.Menu({
			id: 'groupChecklistMenu' + idAppend,
			items: [
				{
					text: 'Displayed title',
					hideOnClick: false,
					menu: {
						items: [ 
							{
								id: 'groupFileMenu-title-groupItem' + idAppend,
								text: 'Group ID and title',
								checked: true,
								group: 'titleType' + idAppend,
								handler: function(item,eventObject){
									var cm = groupGrid.getColumnModel();
									var groupTitleIndex = cm.findColumnIndex('groupTitle');
									var ruleTitleIndex = cm.findColumnIndex('ruleTitle');
									var groupIdIndex = cm.findColumnIndex('groupId');
									var ruleIdIndex = cm.findColumnIndex('ruleId');
									var titleWidth = cm.getColumnWidth(ruleTitleIndex);
									var idWidth = cm.getColumnWidth(ruleIdIndex);
									cm.setColumnWidth(groupTitleIndex,titleWidth);
									cm.setColumnWidth(groupIdIndex,idWidth);
									groupGrid.titleColumnDataIndex = 'groupTitle';
									filterGroupStore();
									cm.setHidden(ruleTitleIndex,true);
									cm.setHidden(ruleIdIndex,true);
									cm.setHidden(groupTitleIndex,false);
									cm.setHidden(groupIdIndex,false);
									groupGrid.autoExpandColumn = 'groupTitle' + idAppend;
								}
							},{
								id: 'groupFileMenu-title-ruleItem' + idAppend,
								text: 'Rule ID and title',
								checked: false,
								group: 'titleType' + idAppend,
								handler: function(item,eventObject){
									var cm = groupGrid.getColumnModel();
									var groupTitleIndex = cm.findColumnIndex('groupTitle');
									var ruleTitleIndex = cm.findColumnIndex('ruleTitle');
									var groupIdIndex = cm.findColumnIndex('groupId');
									var ruleIdIndex = cm.findColumnIndex('ruleId');
									var titleWidth = cm.getColumnWidth(groupTitleIndex);
									var idWidth = cm.getColumnWidth(groupIdIndex);
									cm.setColumnWidth(ruleTitleIndex,titleWidth);
									cm.setColumnWidth(ruleIdIndex,idWidth);
									groupGrid.titleColumnDataIndex = 'ruleTitle';
									filterGroupStore();
									cm.setHidden(groupTitleIndex,true);
									cm.setHidden(groupIdIndex,true);
									cm.setHidden(ruleTitleIndex,false);
									cm.setHidden(ruleIdIndex,false);
									groupGrid.autoExpandColumn = 'ruleTitle' + idAppend;
								}
							}
						]
					}
				}
				,{ 
					text: 'Export Results',
					iconCls: 'sm-export-icon',
					hideOnClick: false,
					menu: {
						items: [ 
							// {
								// text: 'XLS (Zip archive)',
								// iconCls: 'sm-export-icon',
								// handler: function(item,eventObject){
									// var lo = groupStore.lastOptions;
									// window.location='pl/getCurrentExcel.pl' + '?revId=' + lo.params.revId + '&assetId=' + lo.params.assetId;
								// }
							// }
							// ,{
								// id: 'groupFileMenu-export-xccdfItem' + idAppend,
								// text: 'XCCDF (Zip archive)',
								// iconCls: 'sm-export-icon',
								// handler: function(item,eventObject){
									// var lo = groupStore.lastOptions;
									// window.location='pl/getCurrentXccdf.pl' + '?revId=' + lo.params.revId + '&assetId=' + lo.params.assetId;
								// }
							// }
							// ,
							{
								text: 'CKL (Zip archive)',
								iconCls: 'sm-export-icon',
								tooltip: 'Download this checklist in DISA STIG Viewer format for each asset in the collection',
								handler: function(item,eventObject){
									var lo = groupStore.lastOptions;
									window.location='pl/getCollectionCkls.pl' + '?benchmarkId=' + lo.params.benchmarkId + '&revId=' + lo.params.revId + '&collectionId=' + lo.params.collectionId;
								}
							}
						]
					}
				},
				{
					text: 'Reset reviews...',
					iconCls: 'sm-unlock-icon',
					handler: function(){
						//===================================================
						//UNLOCKS ALL RULE REVIEWS FOR A SPECIFIC STIG
						//===================================================
						Ext.Msg.show({
							title: 'Confirm review reset',
							msg: 'Do you want to reset ALL approved reviews<br/>for ANY rule associated with<br/>ANY revision of STIG "' + leaf.benchmarkId + '"<br/>for ALL aseets in Collection "' + leaf.collectionName + '"?',
							buttons: {yes: "&nbsp;Reset reviews&nbsp;", no: "Cancel"},
							icon: Ext.MessageBox.QUESTION,
							closable: false,
							fn: function(buttonId){
								if (buttonId == 'yes'){
									//===============================================
									//GATHER INFORMATION ACCORDINGLY AND EXECUTE
									//THE REVIEW RESET.
									//===============================================
									var unlockObject = new Object;
									unlockObject.benchmarkId = leaf.benchmarkId;
									//unlockObject.stigName = leaf.benchmarkId;
									unlockObject.assetId = -1;
									unlockObject.assetName = '';
									unlockObject.collectionId =leaf.collectionId;
									unlockObject.collectionName=leaf.collectionName;
									unlockObject.gridTorefresh = groupGrid;
									batchReviewUnlock(unlockObject);
									//===============================================
									//REFRESH THE INTERFACE
									//===============================================
									//groupGrid.getStore().reload();
									// Ext.getCmp('content-panel' + idAppend).update('')
									// reviewsGrid.getStore().removeAll(true);
									// reviewsGrid.getView().refresh();
								}
							}
						});
					}
					
				}
				,
				'-'
			]
		});
		
		var groupFilterMenu = new Ext.menu.Menu({
			id: 'groupFilterMenu' + idAppend,
			items: [
				{
					text: 'All checks',
					checked: true,
					group: 'checkType' + idAppend,
					handler: function(item,eventObject){
						groupStore.clearFilter();
						groupGrid.filterState = 'All',
						Ext.getCmp('groupGrid-tb-filterButton' + idAppend).setText('All checks');
					}
				},'-',{ 
					text: 'Manual checks',
					checked: false,
					group: 'checkType' + idAppend,
					handler: function(item,eventObject){
						groupGrid.filterState = 'Manual',
						groupStore.filter('checkType','Manual');
						Ext.getCmp('groupGrid-tb-filterButton' + idAppend).setText('Manual checks');
					}
				},{
					text: 'SCAP checks',
					checked: false,
					group: 'checkType' + idAppend,
					handler: function(item,eventObject){
						groupGrid.filterState = 'SCAP',
						groupStore.filter('checkType','SCAP');
						Ext.getCmp('groupGrid-tb-filterButton' + idAppend).setText('SCAP checks');
					}
				}
			]
		});

		
		/******************************************************/
		// Group grid statistics string
		/******************************************************/
		var getStatsString = function (store) {
			let assetCount = function () {
				let record = store.getAt(0)
				return record.data.naCnt + record.data.nfCnt + record.data.nrCnt + record.data.oCnt
			}
			var totalChecks = store.getCount();
			var checksManual = 0;
			var checksSCAP = 0;
			store.data.each(function(item, index, totalItems ) {
				switch (item.data.checkType) {
					case 'Manual':
						checksManual++;
						break;
					case 'SCAP':
						checksSCAP++;
						break;
				}
			});
			var totalWord = ' checks';
			if (totalChecks == 1) {
				totalWord = ' check';
			}
			var assetWord = ' assets';
			if (assetCount == 1) {
				assetWord = ' asset';
			}
			
			return assetCount() + assetWord + ' assigned ' + totalChecks + totalWord + ' (' + checksManual + ' Manual, ' + checksSCAP + ' SCAP)';
		};

		/******************************************************/
		// The group grid
		/******************************************************/
		var groupGrid = new Ext.grid.GridPanel({
			region: 'north',
			id: 'groupGrid' + idAppend,
			sm_benchmarkId: leaf.benchmarkId,
			sm_revisionStr: leaf.stigRevStr,
			filterState: 'All',
			title: 'Checklist',
			split:true,
			titleColumnDataIndex: 'groupTitle', // STIG Manager defined property
			//collapsible: true,
			store: groupStore,
			stripeRows:true,
			listeners: {
				afterrender: {
					fn: function (grid) {
						var test = '1';
					}
				}
			},
			sm: new Ext.grid.RowSelectionModel ({
				singleSelect: true,
				listeners: {
					rowselect: {
						fn: function(sm,index,record) {
							handleGroupSelectionForCollection(record, idAppend, leaf, groupGrid.sm_benchmarkId, groupGrid.sm_revisionStr); // defined below
						}
					}
				}
			}),
			view: new Ext.grid.GridView({
				forceFit:false,
				emptyText: '',
				// These listeners keep the grid in the same scroll position after the store is reloaded
				holdPosition: true, // HACK to be used with override
				listeners: {
					// beforerefresh: function(v) {
					// v.scrollTop = v.scroller.dom.scrollTop;
					// v.scrollHeight = v.scroller.dom.scrollHeight;
					// },
					// refresh: function(v) {
						// setTimeout(function() { 
							// v.scroller.dom.scrollTop = v.scrollTop + (v.scrollTop == 0 ? 0 : v.scroller.dom.scrollHeight - v.scrollHeight);
						// }, 100);
					// }
				},
				deferEmptyText:false,
				getRowClass: function (record,index) {
					var checkType = record.get('checkType');
					if (checkType == 'SCAP') {
						return 'sm-scap-grid-item';
					} else {
						return 'sm-manual-grid-item';
					}
				}
			}),
			columns: [
				{ 	
					id:'groupId' + idAppend,
					header: "Group",
					width: 95,
					dataIndex: 'groupId',
					sortable: true,
					hideable: false,
					align: 'left'
				}
				,{ 	
					id:'ruleId' + idAppend,
					header: "Rule Id",
					width: 95,
					dataIndex: 'ruleId',
					hidden: true,
					sortable: true,
					hideable: false,
					align: 'left'
				}
				,{ 
					id:'groupTitle' + idAppend,
					header: "Group Title",
					width: 80,
					hidden: false,
					dataIndex: 'groupTitle',
					renderer: columnWrap,
					hideable: false,
					sortable: true
				}
				,{ 
					id:'ruleTitle' + idAppend,
					header: "Rule Title",
					width: 80,
					hidden: true,
					dataIndex: 'ruleTitle',
					renderer: columnWrap,
					hideable: false,
					sortable: true
				}
				,{ 	
					id:'cat' + idAppend,
					header: "CAT", 
					width: 32,
					align: 'center',
					dataIndex: 'severity',
					fixed: true,
					sortable: true,
					renderer: renderSeverity
				}
				,{ 	
					id:'oCnt' + idAppend,
					header: '<div style="color:red;font-weight:bolder;">O</div>', 
					width: 32,
					align: 'center',
					dataIndex: 'oCnt',
					renderer:renderOpen,
					fixed: true,
					sortable: true
				}
				,{ 	
					id:'nfCnt' + idAppend,
					header: '<div style="color:green;font-weight:bolder;">NF</div>', 
					width: 32,
					align: 'center',
					renderer:renderCounts,
					dataIndex: 'nfCnt',
					fixed: true,
					sortable: true
				}
				,{ 	
					id:'naCnt' + idAppend,
					header: '<div style="color:grey;font-weight:bolder;">NA</div>', 
					width: 32,
					align: 'center',
					renderer:renderCounts,
					dataIndex: 'naCnt',
					fixed: true,
					sortable: true
				}
				,{ 	
					id:'nrCnt' + idAppend,
					header: "NR", 
					width: 32,
					align: 'center',
					renderer:renderOpen,
					dataIndex: 'nrCnt',
					fixed: true,
					sortable: true
				}
				,{ 	
					id:'readyCnt' + idAppend,
					header: "<img src=img/ready-16.png width=12 height=12>", 
					width: 32,
					align: 'center',
					renderer:renderOpen,
					dataIndex: 'readyCnt',
					fixed: true,
					renderer:renderStatusCounts,
					sortable: true
				}
				,{ 	
					id:'rejectCnt' + idAppend,
					header: "<img src=img/rejected-16.png width=12 height=12>", 
					width: 32,
					align: 'center',
					renderer:renderOpen,
					dataIndex: 'rejectCnt',
					fixed: true,
					renderer:renderStatusCounts,
					sortable: true
				}
				,{ 	
					id:'approveCnt' + idAppend,
					header: "<img src=img/lock-16.png width=12 height=12>", 
					width: 32,
					align: 'center',
					renderer:renderOpen,
					dataIndex: 'approveCnt',
					fixed: true,
					renderer:renderStatusCounts,
					sortable: true
				}
			],
			autoExpandColumn:'groupTitle' + idAppend,
			//width: '33%',
			height: '50%',
			loadMask: true,
			tbar: new Ext.Toolbar({
				items: [
					{
						xtype: 'tbbutton',
						iconCls: 'sm-checklist-icon',  // <-- icon
						text: 'Checklist',
						menu: groupChecklistMenu
					},'-',{
						xtype: 'tbbutton',
						id: 'groupGrid-tb-filterButton' + idAppend,
						iconCls: 'sm-filter-icon',  // <-- icon
						text: 'All checks',
						menu: groupFilterMenu
					}
					,{
						xtype: 'trigger',
						fieldLabel: 'Filter',
						triggerClass: 'x-form-clear-trigger',
						onTriggerClick: function() {
							this.triggerBlur();
							this.blur();
							this.setValue('');
							filterGroupStore();
						},
						id: 'groupGrid-filterTitle' + idAppend,
						width: 140,
						submitValue: false,
						disabled: false,
						enableKeyEvents:true,
						emptyText:'Title filter...',
						listeners: {
							keyup: function (field,e) {
								filterGroupStore();
								return false;
							}
						}
					}
				]
			}),
			bbar: new Ext.Toolbar({
				items: [
				{
					xtype: 'tbbutton',
					iconCls: 'icon-refresh',
					tooltip: 'Reload this grid',
					width: 20,
					handler: function(btn){
						groupGrid.getStore().reload();
						Ext.getCmp('content-panel' + idAppend).update('')
						reviewsGrid.getStore().removeAll(true);
						reviewsGrid.getView().refresh();
					}
				},{
					xtype: 'tbseparator'
				},{
					xtype: 'tbtext',
					id: 'groupGrid-totalText' + idAppend,
					text: '',
					width: 80
				}]
			})
		});
		
		var handleRevisionMenu = function (item, eventObject) {
			let store = Ext.getCmp('groupGrid' + idAppend).getStore()
			store.proxy.setUrl(`${STIGMAN.Env.apiBase}/collections/${leaf.collectionId}/checklists/${leaf.benchmarkId}/${item.revisionStr}`, true)
			store.load();
			loadRevisionMenu(leaf.benchmarkId, item.revisionStr, idAppend)
			groupGrid.sm_revisionStr = item.revisionStr
		};
		
		async function loadRevisionMenu(benchmarkId, activeRevisionStr, idAppend) {
			try {
			let result = await Ext.Ajax.requestPromise({
				url: `${STIGMAN.Env.apiBase}/stigs/${benchmarkId}/revisions`,
				method: 'GET'
			})
			let revisions = JSON.parse(result.response.responseText)
			let revisionObject = getRevisionObj(revisions, activeRevisionStr, idAppend)
			if (Ext.getCmp('revision-menuItem' + idAppend) === undefined) {
				Ext.getCmp('groupChecklistMenu' + idAppend).addItem(revisionObject.menu);
			}
			groupGrid.setTitle(revisionObject.activeRevisionLabel);
			}
			catch (e) {
			alert(e.message)
			}
		}
		
		let getRevisionObj = function (revisions, activeRevisionStr, idAppend) {
			let returnObject = {}
			var menu = {
			id: 'revision-menuItem' + idAppend,
			text: 'Revisions',
			hideOnClick: false,
			menu: {
				items: []
			}
			};
			for (var i = 0; i < revisions.length; i++) {
			let r = revisions[i]
			let benchmarkDateJs = new Date(r.benchmarkDate)
			let item = {
				id: `revision-submenu${r.benchmarkId}-${r.version}-${r.release}${idAppend}`,
				text: `Version ${r.version} Release ${r.release} (${benchmarkDateJs.format('j M Y')})`,
				// revId: `${r.benchmarkId}-${r.version}-${r.release}`,
				revisionStr: r.revisionStr,
				group: 'revision-submenu-group' + idAppend,
				handler: handleRevisionMenu
			}
			if (item.revisionStr == activeRevisionStr) {
				item.checked = true;
				returnObject.activeRevisionLabel = item.text;
			} else {
				item.checked = false;
			}
			menu.menu.items.push(item);
			}
			returnObject.menu = menu;
			return returnObject;
		};
			
		function filterGroupStore () {
			var filterArray = [];
			// Filter menu
			switch (groupGrid.filterType) {
				case 'Manual':
				case 'SCAP':
					filterArray.push({
						property: 'checkType',
						value: groupGrid.filterType
					});
					break;
				case 'Incomplete':
					filterArray.push({
						fn: function(record) {
							return record.get('done') == 0;
						}
					});
					break;
			}
			// Title textfield
			var titleValue = Ext.getCmp('groupGrid-filterTitle' + idAppend).getValue();
			if (titleValue.length > 0) {
				filterArray.push({
					property: groupGrid.titleColumnDataIndex,
					value: titleValue,
					anyMatch: true,
					caseSensitive: false
				});
			}
			
			groupStore.filter(filterArray);

		}
	/******************************************************/
	// END Group Grid
	/******************************************************/

	/******************************************************/
	// START Reviews Panel
	/******************************************************/
		var reviewsFields = Ext.data.Record.create([
			{	
				name:'assetId',
				type: 'int'
			},,{	
				name:'assetName',
				type: 'string'
			},{
				name:'result',
				type: 'string'
			},{
				name:'resultComment',
				type:'string'
			},{
				name:'action',
				type:'string'
			},{
				name:'actionComment',
				type:'string'
			},,{
				name:'autoResult',
				type:'boolean'
			},{
				name:'userId',
				type:'int'
			},{
				name:'username',
				type:'string'
			},{
				name:'ts',
				type:'date',
				dateFormat: 'Y-m-d H:i:s'
			},{
				name:'status',
				type:'string'
			}
		]);
		
		var reviewsStore = new Ext.data.JsonStore({
			storeId: 'reviewsStore' + idAppend,
			sortInfo: {
				field: 'assetName',
				direction: 'ASC' // or 'DESC' (case sensitive for local sorting)
			},
			proxy: new Ext.data.HttpProxy({
				method: 'POST',
				url: 'pl/getCurrentReviews.pl', // see options parameter for Ext.Ajax.request
				api: {
					// all actions except the following will use above url
					update: 'pl/updateReviews.pl'
				},
				listeners: {
					beforewrite: function (proxy, action, rs, params) {
						// set params so server-side script can return counts for rules with updated reviews
						params.collectionId = thisTab.collectionId;
						params.benchmarkId = thisTab.benchmarkId;
						params.revId = thisTab.revId;
					},
					write: function (proxy, action, data, response, rs, options) {
						if (action == 'update') { // response is from our update API
							var counts = response.raw.counts;
							for (var i=0; i <counts.length; i++) {
								var record = groupStore.getAt(groupStore.findExact('ruleId',counts[i].ruleId));
								record.data.approveCnt = counts[i].approveCnt;
								record.data.naCnt = counts[i].naCnt;
								record.data.nfCnt = counts[i].nfCnt;
								record.data.nrCnt = counts[i].nrCnt;
								record.data.oCnt = counts[i].oCnt;
								record.data.readyCnt = counts[i].readyCnt;
								record.data.rejectCnt = counts[i].rejectCnt;
								record.commit();
							}
						}
					}
				}
			}),
			root: '',
			//id: 'reviewStore' + idAppend,
			fields: reviewsFields,
			writer:new Ext.data.JsonWriter({
				encode: true,
				writeAllFields: false
			}),
			listeners: {
				exception: function(misc) {
					// var ourView = reviewsGrid.getView();
					// var response = misc.events.exception.listeners[1].fn.arguments[4];
					// if (response.status != 0) {
						// var maskStr = 'Load failed: ' + response.responseText;
						// //ourView.emptyText = 'Load failed: ' + response.responseText;
					// } else {
						// //ourView.emptyText = 'HTTP Server Error: ' + response.statusText;
						// var maskStr = 'HTTP Server Error: ' + response.statusText;
					// }
					// //ourView.refresh();
					// reviewsGrid.getEl().mask(maskStr);
				},
				load: function () {
					// var ourGrid = Ext.getCmp('reviewsGrid' + idAppend);
					// ourGrid.getSelectionModel().selectFirstRow();
				}
				// write: function ( store, action, result, res, rs ) {
					// var one = 1;
				// },
				// update: function ( store, record, operation ) {
					// var one = 1;
				// },
				// beforesave: function ( store, batch, data ) {
					// var one = 1;
				// },
				,save: function ( store, batch, data ) {
					var ourGrid = Ext.getCmp('reviewsGrid' + idAppend);
					setReviewsGridButtonStates(ourGrid.getSelectionModel());
					Ext.getBody().unmask();
				}
			},
			idProperty: 'assetId'
		});

		// var expander = new Ext.ux.grid.RowExpander({
			// tpl : new Ext.Template(
				// '<p><b>Reviewer:</b> {user}</p>',
				// '<p><b>Result Comment:</b> {resultComment}</p>',
				// '<p><b>Action Comment:</b> {actionComment}</p>'
			// )
		// });

		var editor = new Ext.ux.grid.RowEditor({
			saveText: 'Update',
			height: 200,
			listeners: {
				beforeedit: function (editor,rowIdx) {
				}
			}
		});
		
		var reviewsCm = new Ext.grid.ColumnModel({
			columns: [
				{ 	
					id:'status' + idAppend,
					header: "Status", 
					width: 50,
					fixed: true,
					dataIndex: 'status',
					sortable: true,
					renderer: renderStatuses
				},
				{ 	
					id:'target' + idAppend,
					header: "Asset",
					width: 50,
					//fixed: true,
					dataIndex: 'assetName',
					sortable: true,
					align: 'left'
				}
				,{ 
					id:'result' + idAppend,
					header: "Result",
					width: 50,
					fixed: true,
					dataIndex: 'result',
					editor: new Ext.form.ComboBox({
						id: 'reviewsGrid-editor-resultCombo' + idAppend,
						mode: 'local',
						forceSelection: true,
						autoSelect: true,
						editable: false,
						store: new Ext.data.SimpleStore({
							fields: ['result', 'resultStr'],
							data: [['pass', 'Not a Finding'], ['notapplicable', 'Not Applicable'], ['fail', 'Open']]
						}),
						valueField:'result',
						displayField:'resultStr',
						monitorValid: false,
						listeners: {
							select: function (combo,record,index) {
								//if (this.gridEditor.gridRecord.result == 4 && record.data.result != 4) { // Open result has been changed 
								if (combo.startValue == 'fail' && combo.value != 'fail') { // Open result has been changed 
									if ((combo.gridEditor.gridRecord.data.action != 0 && combo.gridEditor.gridRecord.data.action != undefined) || combo.gridEditor.gridRecord.data.actionComment != '') {
										combo.suspendEvents(false);
										var confirmStr="You are closing an Open finding in a review that contains an existing Recommended Action. If you continue, the Action and Action Comment will be permanently deleted from the review.<BR><BR>Do you want to continue closing this finding?";
										// the default z-index is 11000, which puts it above the mask used by Ext.Msg 
										combo.gridEditor.el.setStyle('z-index','8000'); 
										Ext.Msg.confirm("Confirm",confirmStr,function (btn,text) {
											if (btn == 'yes') {
												combo.gridEditor.gridRecord.data.action = null;
												combo.gridEditor.gridRecord.data.actionComment = '';
												combo.gridEditor.gridRecord.commit(false); // don't fire 'write' event on the store
												
												combo.resumeEvents();
												combo.fireEvent("blur");
											} else {
												combo.setValue(combo.startValue);
												combo.resumeEvents();
												combo.fireEvent("blur");
											}
										});
									} else {
										combo.fireEvent("blur");
									}
								} else {
									combo.fireEvent("blur");
								}
							}
						},
						triggerAction: 'all'
					}),
					renderer: function (val) {
						switch (val) {
							case 'fail':
								return '<div style="color:red;font-weight:bolder;text-align:center">O</div>';
								break;
							case 'pass':
								return '<div style="color:green;font-weight:bolder;text-align:center">NF</div>';
								break;
							case 'notapplicable':
								return '<div style="color:grey;font-weight:bolder;text-align:center">NA</div>';
								break;
						}
					},
					sortable: true
				}
				,{ 	
					id:'resultComment' + idAppend,
					header: "Result comment", 
					width: 100,
					dataIndex: 'resultComment',
					renderer: columnWrap,
					sortable: true,
					editor: new Ext.form.TextArea({
						id: 'reviewsGrid-editor-resultComment' + idAppend,
						//height: 150
						grow: true,
						listeners: {
							// focus and blur handlers enable/disable IE workaround
							focus: function (cmp) {
								reviewsGrid.getEl().set({
									onselectstart: 'return true;'
								});
							},
							blur: function (cmp) {
								reviewsGrid.getEl().set({
									onselectstart: 'return false;'
								});
							}
						}
					})
				}
				,{ 	
					id:'action' + idAppend,
					header: "Action", 
					width: 80,
					fixed: true,
					dataIndex: 'action',
					renderer: function (val) {
						var actions = ['','Remediate','Mitigate','Exception'];
						return actions[val];
					},
					editor: new Ext.form.ComboBox({
						id: 'reviewsGrid-editor-actionCombo' + idAppend,
						mode: 'local',
						tpl: new Ext.XTemplate(
							'<tpl for=".">',
								'<tpl if="action == null">',
								'<div ext:qtip="Delete this action from the database" class="x-combo-list-item" style="color:grey;font-style:italic;">Delete</div>',
								'</tpl>',
								'<tpl if="action != null">',
								'<div class="x-combo-list-item">{actionStr}</div>',
								'</tpl>',
							'</tpl>'
						),
						valueNotFoundText: null,
						forceSelection: true,
						autoSelect: true,
						editable: false,
						store: new Ext.data.SimpleStore({
							fields: ['action', 'actionStr'],
							data: [['remediate', 'Remediate'], ['mitigate', 'Mitigate'], ['exception', 'Exception']]
						}),
						displayField:'actionStr',
						valueField: 'action',
						listeners: {
							select: function () {
								this.fireEvent("blur");
							}
						},
						triggerAction: 'all'
					}),
					sortable: true
				}
				,{ 	
					id:'actionComment' + idAppend,
					header: "Action comment", 
					width: 100,
					dataIndex: 'actionComment',
					renderer: columnWrap,
					editor: new Ext.form.TextArea({
						id: 'reviewsGrid-editor-actionComment' + idAppend,
						grow: true,
						listeners: {
							// focus and blur handlers enable/disable IE workaround
							focus: function (cmp) {
								reviewsGrid.getEl().set({
									onselectstart: 'return true;'
								});
							},
							blur: function (cmp) {
								reviewsGrid.getEl().set({
									onselectstart: 'return false;'
								});
							}
						}
					}),
					sortable: true
				}
				// ,{ 	
					// id:'userName' + idAppend,
					// header: "User", 
					// width: 100,
					// dataIndex: 'userName',
					// fixed: 50,
					// sortable: true
				// }
			],
			isCellEditable: function(col, row) {
				var record = reviewsStore.getAt(row);

				if (record.data.reviewId == 0) { // review is not created yet
					return false;
				}

				switch (this.getDataIndex(col)) {
					case 'result':
					case 'resultComment':
						if (record.data.autoResult == 1) {
							return false;
						} else {
							return true;
						}
						break;
					case 'action':
					case 'actionComment':
						if (record.data.result == 'fail') {
							return true;
						} else {
							return false;
						}
						break;
				}

				return Ext.grid.ColumnModel.prototype.isCellEditable.call(this, col, row);
			}
		});

		var reviewsGrid = new Ext.grid.EditorGridPanel({
			region: 'center',
			//enableDragDrop: true,
			//ddGroup: 'gridDDGroup',
			//plugins: editor,
			layout: 'fit',
			//height: 350,
			border: true,
			id: 'reviewsGrid' + idAppend,
			title: 'Reviews',
			store: reviewsStore,
			stripeRows:true,
			colModel: reviewsCm,
			sm: new Ext.grid.RowSelectionModel ({
				singleSelect: false,
				id: 'reviewsSm' + idAppend,
				listeners: {
					rowselect: function(sm,index,record) {
						if (sm.getCount() == 1) { //single row selected
							metadataGrid.enable();
							// attachGrid.enable();
							historyData.grid.enable();
							loadResources(record);
						} else {
							metadataStore.removeAll();
							metadataGrid.disable();
							// attachStore.removeAll();
							// attachGrid.disable();
							historyData.store.removeAll();
							historyData.grid.disable();
							setRejectButtonState();
						}
						setReviewsGridButtonStates(sm);
					},
					rowdeselect: function(sm,index,deselectedRecord) {
						if (sm.getCount() == 1) { //single row selected
							selectedRecord = sm.getSelected();
							metadataGrid.enable();
							// attachGrid.enable();
							historyData.grid.enable();
							loadResources(selectedRecord);
						} else {
							metadataStore.removeAll();
							metadataGrid.disable();
							// attachStore.removeAll();
							// attachGrid.disable();
							historyData.store.removeAll();
							historyData.grid.disable();
							setRejectButtonState();
						}
						setReviewsGridButtonStates(sm);
					}
				}
			}),
			listeners: {
				// fix weird problem shift-selecting grid rows in IE
				// have to override this if the textarea editors are focused
				afterrender: function (cmp) {
					cmp.getEl().set({
						onselectstart: 'return false;'
					});
				},
				afteredit: function (e) {
					setReviewsGridButtonStates();
				}
			},
			view: new Ext.grid.GridView({
				forceFit:true,
				autoFill:true,
				emptyText: 'No data to display.',
				deferEmptyText:false,
				getRowClass: function(record, rowIndex, rp, ds){ // rp = rowParams
					if(record.data.result == 'fail'){
						return 'sm-grid3-row-red';
					} else if (record.data.result == 'pass') {
						return 'sm-grid3-row-green';
					} else if (record.data.result == 'notapplicable') {
						return 'sm-grid3-row-grey';
					}
				}
				
			}),
			// width: 300,
			tbar: new Ext.Toolbar({
				items: [
					{
						xtype: 'tbbutton',
						icon: 'img/lock-16.png',
						id: 'reviewsGrid-approveButton' + idAppend,
						text: 'Approve',
						handler: function (btn) {
							var selModel = reviewsGrid.getSelectionModel();
							handleStatusChange (reviewsGrid,selModel,3);
						}
					}
					,'-'
					,{
						xtype: 'tbbutton',
						icon: 'img/ready-16.png',  // <-- icon
						id: 'reviewsGrid-submitButton' + idAppend,
						text: 'Submit',
						handler: function (btn) {
							var selModel = reviewsGrid.getSelectionModel();
							handleStatusChange (reviewsGrid,selModel,1);
						}
					}
				]
			}),
			bbar: new Ext.Toolbar({
				items: [
				{
					xtype: 'tbbutton',
					iconCls: 'icon-refresh',
					tooltip: 'Reload this grid',
					width: 20,
					handler: function(btn){
						reviewsGrid.getStore().reload();
					}
				}]
			}),
			loadMask: true,
			emptyText: 'No data to display'
		});

		reviewsGrid.on('beforeedit', beforeEdit, this );

		async function getContent(benchmarkId, revisionStr, ruleId, groupId) {
			try {
				// Content panel
				let contentPanel = Ext.getCmp('content-panel' + idAppend);
				let contentReq = await Ext.Ajax.requestPromise({
					url: `${STIGMAN.Env.apiBase}/stigs/${benchmarkId}/revisions/${revisionStr}/rules/${ruleId}`,
					method: 'GET',
					params: {
						projection: ['details','cci','checks','fixes']
					}
				})
				let content = JSON.parse(contentReq.response.responseText)
				contentPanel.update(content)
				contentPanel.setTitle('Rule for Group ' + groupId);
			}
			catch (e) {
				alert(e.message)
			}
		}

		async function getReviews(collectionId, ruleId) {
			try {
				// Reviews grid
				let reviewsGrid = Ext.getCmp('reviewsGrid' + idAppend);
				let reviewsReq = await Ext.Ajax.requestPromise({
					url: `${STIGMAN.Env.apiBase}/reviews`,
					method: 'GET',
					params: {
						collectionId: collectionId,
						ruleId: ruleId,
					}
				})
				let fetchedReviews = JSON.parse(reviewsReq.response.responseText)
				let fetchedReviewsLookup = {}
				for (const fetchedReview of fetchedReviews) {
					fetchedReviewsLookup[fetchedReview.assetId] = fetchedReview
				}
				let pkgReviews = pkgAssets.map(pkgAsset => {
					return {...pkgAsset, ...fetchedReviewsLookup[pkgAsset.assetId]}
				})
			
				reviewsGrid.getStore().loadData(pkgReviews)
				reviewsGrid.setTitle(`Reviews of ${ruleId}`)
			}
			catch (e) {
				alert (e.message)
			}
		}
		
		function handleGroupSelectionForCollection(record, idAppend, leaf, benchmarkId, revisionStr) {
			getContent(benchmarkId, revisionStr, record.data.ruleId, record.data.groupId)
			getReviews(leaf.collectionId, record.data.ruleId)

			// // Content panel
			// let contentPanel = Ext.getCmp('content-panel' + idAppend);
			// let contentReq = await Ext.Ajax.requestPromise({
			// 	url: `${STIGMAN.Env.apiBase}/stigs/${benchmarkId}/revisions/${revisionStr}/rules/${record.data.ruleId}`,
			// 	method: 'GET',
			// 	params: {
			// 		projection: ['details','cci','checks','fixes']
			// 	}
			// })
			// let content = JSON.parse(contentReq.response.responseText)
			// contentPanel.update(content)
			// contentPanel.setTitle('Rule for Group ' + record.data.groupId);
		
			// // Reviews grid
			// let reviewsGrid = Ext.getCmp('reviewsGrid' + idAppend);
			// let reviewsReq = await Ext.Ajax.requestPromise({
			// 	url: `${STIGMAN.Env.apiBase}/reviews`,
			// 	method: 'GET',
			// 	params: {
			// 		collectionId: leaf.collectionId,
			// 		ruleId: record.data.ruleId,
			// 	}
			// })
			// let fetchedReviews = JSON.parse(reviewsReq.response.responseText)
			// let fetchedReviewsLookup = {}
			// for (const fetchedReview of fetchedReviews) {
			// 	fetchedReviewsLookup[fetchedReview.assetId] = fetchedReview
			// }
			// let pkgReviews = pkgAssets.map(pkgAsset => {
			// 	return {...pkgAsset, ...fetchedReviewsLookup[pkgAsset.assetId]}
			// })
		
			// reviewsGrid.getStore().loadData(pkgReviews)
		}

		function setReviewsGridButtonStates() {
			var sm = reviewsGrid.getSelectionModel();
			var approveBtn = Ext.getCmp('reviewsGrid-approveButton' + idAppend);
			var submitBtn = Ext.getCmp('reviewsGrid-submitButton' + idAppend);
			var selections = sm.getSelections();
			var selLength = selections.length;
			var approveBtnDisabled = false;
			var submitBtnDisabled = false;
			var rejectFormDisabled = false;

			mainloop:
			for (i=0; i<selLength; i++) {
				if (selections[i].data.reviewId == 0) { // a review doesn't exist
					approveBtnDisabled = true;
					submitBtnDisabled = true;
					break mainloop;
				}
				var status = selections[i].data.status;
				switchloop:
				switch (status) {
					case 'saved': // in progress
						approveBtnDisabled = true;
						if (isReviewComplete(
							selections[i].data.result,
							selections[i].data.resultComment,
							selections[i].data.action,
							selections[i].data.actionComment
							)) {
							//submitBtnDisabled = false;
						} else {
							submitBtnDisabled = true;
							rejectFormDisabled = true;
						}
						break switchloop;
					case 'submitted': // ready
						submitBtnDisabled = true;
						break switchloop;
					case 'rejected': // rejected
						break;
					case 'accepted': // approved
						approveBtnDisabled = true;
						rejectFormDisabled = true;
						break switchloop;
				}
			}

			approveBtn.setDisabled(approveBtnDisabled);
			submitBtn.setDisabled(submitBtnDisabled);
			rejectFormPanel.setDisabled(rejectFormDisabled);
		};
		
		function handleStatusChange (grid,sm,status) {
			Ext.getBody().mask('Updating...');
			var selections = sm.getSelections();
			var selLength = selections.length;
			grid.getStore().suspendEvents(false);
			for (i=0; i<selLength; i++) {
				selections[i].set('status',status);
			}
			grid.getStore().resumeEvents();
			grid.getStore().save();
			
		};

		function beforeEdit(e) {
			if (e.field == 'result') {
				var editor = e.grid.getColumnModel().getCellEditor(e.column,e.row);
				editor.gridRecord = e.record;
			}
		};

		function afterEdit(e) {
		};
		
	/******************************************************/
	// END Reviews Panel
	/******************************************************/

	let contentTpl = new Ext.XTemplate(
		'<div class=cs-home-header-top>{ruleId}</div>',
		'<div class=cs-home-header-sub>{title} (Category {severity})</div>',
		'<div class=cs-home-body-title>Manual Check',
		'<div class=cs-home-body-text>',
		'<tpl for="checks">',
		'<pre>{[values.content.trim()]}</pre>',
		'</tpl>',
		'</div>',
		'</div>',
		'<div class=cs-home-body-title>Fix',
		'<div class=cs-home-body-text>',
		'<tpl for="fixes">',
		'<pre>{[values.text.trim()]}</pre>',
		'</tpl>',
		'</div>',
		'</div>',
		'<div class=cs-home-header-sub></div>',
		'<div class=cs-home-body-title>Other Data',
		'<div class=cs-home-body-text><b>Vulnerability Discussion</b><br><br>',
		'<pre>{[values.vulnDiscussion.trim()]}</pre>',
		'</div>',
		'<div class=cs-home-body-text><b>Documentable: </b>{documentable}</div>',
		'<div class=cs-home-body-text><b>Responsibility: </b>{responsibility}</div>',
		'<div class=cs-home-body-text><b>Controls: </b><br>',
		'<table class=cs-home-body-table border="1">',
		'<tr><td><b>CCI</b></td><td><b>AP Acronym</b></td><td><b>Control</b></td></tr>',
		'<tpl for="ccis">',
		'<tr><td>{cci}</td><td>{ap}</td><td>{control}</td></tr>',
		'</tpl>',
		'</table>',
		'</div>',
		'</div>')

	/******************************************************/
	// START Resources Panel
	/******************************************************/
		function loadResources (record) {
			var activeTab = Ext.getCmp('resources-tab-panel' + idAppend).getActiveTab();
			activeTab.getEl().mask('Loading...');
			Ext.Ajax.request({
				url: 'pl/getReviewResources.pl',
				params: { 
					checkId: record.id
				},
				success: function(response, request) {                               
					var responseObj = Ext.util.JSON.decode(response.responseText);
					
					// load metadata
					Ext.getCmp('metadataGrid' + idAppend).getStore().loadData(responseObj.metadata);
					// load feedback
					var rejectFp = Ext.getCmp('rejectFormPanel' + idAppend);
					rejectFp.reviewRecords = [record];
					rejectFp.getForm().setValues(responseObj.feedback);
					setRejectButtonState();
					// load attachments
					//var attachGrid = Ext.getCmp('attachGrid' + idAppend);
					// attachGrid.getStore().loadData(responseObj.attachments);
					// attachGrid.gridRecord = record;

					// load history
					Ext.getCmp('historyGrid' + idAppend).getStore().loadData(responseObj.history);

					activeTab.getEl().unmask();
				}
			});
		}
		
	/******************************************************/
	// START Resources Panel/History
	/******************************************************/
		var historyData = new Sm_HistoryData(idAppend);

	/******************************************************/
	// END Resources Panel/History
	/******************************************************/

	/******************************************************/
	// START Resources Panel/Metadata
	/******************************************************/

		var metadataFields = Ext.data.Record.create([
			{	
				name:'property',
				type: 'string'
			},{
				name: 'value',
				type: 'string'
			}
		]);
		
		var metadataStore = new Ext.data.ArrayStore({
			fields: metadataFields
		});
		
		var metadataGrid = new Ext.grid.GridPanel({
			id: 'metadataGrid' + idAppend,
			sm: new Ext.grid.RowSelectionModel ({singleSelect: true}),
			loadMask: true,
			stripeRows: true,
			border: false,
			view: new Ext.grid.GridView({forceFit:true}),
			store: metadataStore,
			columns: [
			{ 	
				id:'metadataGrid-property' + idAppend,
				header: "Property", 
				width: 150,
				fixed: true,
				dataIndex: 'property',
				sortable: true
			},
			{ 	
				id:'metadataGrid-value' + idAppend,
				header: "Value", 
				width: 150,
				fixed: true,
				dataIndex: 'value',
				sortable: true
			}]
		});
		
	/******************************************************/
	// END Resources Panel/Metadata
	/******************************************************/
	/******************************************************/
	// START Resources Panel/Feedback
	/******************************************************/

		var rejectFields = Ext.data.Record.create([
			{	
				name:'rejectId',
				type: 'int'
			},{	
				name:'shortStr',
				type: 'string'
			},{
				name: 'longStr',
				type: 'string'
			}
		]);
		
		var rejectStore = new Ext.data.JsonStore({
			url: 'pl/getRejectStrings.pl',
			autoLoad: true,
			fields: rejectFields,
			root: 'rows',
			idProperty: 'rejectId'
		});
		
		var rejectSm = new Ext.grid.CheckboxSelectionModel({
			checkOnly: true,
			onRefresh: function() {
				var ds = this.grid.store, index;
				var s = this.getSelections();
				for(var i = 0, len = s.length; i < len; i++){
					var r = s[i];
					if((index = ds.indexOfId(r.id)) != -1){
						this.grid.view.addRowClass(index, this.grid.view.selectedRowClass);
					}
				}
			},
			listeners: {
				selectionchange: setRejectButtonState
			}
		});

		var rejectGrid = new Ext.grid.GridPanel({
			id: 'rejectGrid' + idAppend,
			title: 'Standard feedback',
			flex: 50, // for hbox layout
			margins: {top:0, right:0, bottom:0, left:10},
			hideHeaders: true,
			hideLabel: true,
			isFormField: true,
			store: rejectStore,
			columns: [
				rejectSm,
				{ 	header: "shortStr", 
					width: 95,
					dataIndex: 'shortStr',
					sortable: true,
					renderer: function (value, metaData, record, rowIndex, colIndex, store) {
						metaData.attr = 'ext:qtip="' + record.data.longStr + '"';
						return value;
					}
				}
			],
			viewConfig: {
				forceFit: true
			},
			sm: rejectSm,
			setValue: function(v) {
				var selRecords = [];
				for(y=0;y<v.length;y++) {
					var record = rejectStore.getById(v[y]);
					selRecords.push(record);
				}
				rejectSm.selectRecords(selRecords);
			},
			reset: function () {
				rejectGrid.getSelectionModel().clearSelections();
			},
			getValue: function() {},
			markInvalid: function() {},
			clearInvalid: function() {},
			validate: function() { return true},
			isValid: function() { return true;},
			getName: function() {return this.name},
			fieldLabel: '',
			listeners: {
				// 'afterlayout': {
					// fn: function(p){
						// p.disable();
					// },
					// single: true // important, as many layouts can occur
				// }
			},
			name: 'rejectIds'
		});
		
		var rejectOtherPanel = new Ext.Panel ({
			layout: 'fit',
			id: 'rejectOtherPanel' + idAppend,
			title: 'Custom feedback',
			bodyCssClass: 'sm-background-blue',
			padding: '5',
			flex: 50,
			items: [{
				xtype: 'textarea',
				id: 'rejectTextArea' + idAppend,
				enableKeyEvents: true,
				emptyText: 'Enter other feedback...',
				name: 'rejectText',
				listeners: {
					keyup: setRejectButtonState
				}
			}]
		});
		
		var rejectFormPanel = new Ext.form.FormPanel({
			baseCls: 'x-plain',
			id: 'rejectFormPanel' + idAppend,
			cls: 'sm-background-blue',
			labelWidth: 95,
			url:'pl/setReviewRejection.pl',
			monitorValid: false,
			items: [
			{
				layout: 'hbox',
				anchor: '100% -1',
				padding: '10',
				baseCls: 'x-plain',
				border: false,
				layoutConfig: {
					align: 'stretch'
				},
				items: [rejectOtherPanel,rejectGrid]
			}],
			buttons: [{
				text: 'Return review with this feedback',
				id: 'rejectSubmitButton' + idAppend,
				iconCls: 'sm-rejected-icon',
				handler: function(){
					Ext.getBody().mask("Updating....");
					var reviewRecords = reviewsGrid.getSelectionModel().getSelections();
					var checkIds = [];
					for (var i = 0, len = reviewRecords.length ; i < len ; i++) {
						checkIds.push(reviewRecords[i].id);
					}
					// submitting only updates the reject content, not the status
					rejectFormPanel.getForm().submit({
						submitEmptyText: false,
						params : {
							checkIds: Ext.util.JSON.encode(checkIds),
							rejectIds: encodeSm(rejectSm,'rejectId')
						},
						success: function (f,a) {
							reviewsStore.suspendEvents(false);
							for (var i = 0, len = reviewRecords.length ; i < len ; i++) {
								reviewRecords[i].beginEdit();
								reviewRecords[i].set('status','rejected'); // this will update the status to 'reject' when the store is saved
								reviewRecords[i].endEdit();
							}
							reviewsStore.resumeEvents();
							reviewsStore.save();
							Ext.getBody().unmask();
						},
						failure: function (f,a) {
						}
					});
				}
			}]
		});
		
		function setRejectButtonState () {
			var btn = Ext.getCmp('rejectSubmitButton' + idAppend);
			var text = Ext.getCmp('rejectTextArea' + idAppend);
			var reviewsCount = reviewsGrid.getSelectionModel().getCount();
			if (reviewsCount > 1) {
				btn.setText("Return " + reviewsCount + " reviews with this feedback");
			} else {
				btn.setText("Return review with this feedback");
			}
			if (text.getValue() == '' && rejectSm.getCount() == 0) {
				btn.disable();
			} else {
				btn.enable();
			}
		}

	/******************************************************/
	// End Resources Panel/Feedback
	/******************************************************/
	// /******************************************************/
	// // START Resources Panel/Attachments
	// /******************************************************/
	// 	var attachFields = Ext.data.Record.create([
	// 		{
	// 			name: 'raId',
	// 			type: 'int'
	// 		},{
	// 			name: 'artId',
	// 			type: 'int'
	// 		},{	
	// 			name:'filename',
	// 			type: 'string'
	// 		},{
	// 			name:'userName',
	// 			type: 'string'
	// 		},{
	// 			name:'description',
	// 			type: 'string'
	// 		},{
	// 			name: 'ts',
	// 			type: 'date',
	// 			dateFormat: 'Y-m-d H:i:s'
	// 		}
	// 	]);

	// 	var attachStore = new Ext.data.JsonStore({
	// 		root: 'rows',
	// 		sortInfo: {
	// 			field: 'filename',
	// 			direction: 'ASC' // or 'DESC' (case sensitive for local sorting)
	// 		},
	// 		storeId: 'attachStore' + idAppend,
	// 		fields: attachFields,
	// 		idProperty: 'raId'
	// 	});

	// 	var attachGrid = new Ext.grid.GridPanel({
	// 		//region: 'center',
	// 		disableSelection: true,
	// 		layout: 'fit',
	// 		cls: 'custom-artifacts',
	// 		hideHeaders: true,
	// 		border: false,
	// 		id: 'attachGrid' + idAppend,
	// 		store: attachStore,
	// 		stripeRows:true,
	// 		// sm: new Ext.grid.RowSelectionModel ({
	// 			// singleSelect: true
	// 		// }),
	// 		view: new Ext.grid.GridView({
	// 			forceFit:true,
	// 			emptyText: 'No attachments to display.',
	// 			deferEmptyText:false
	// 		}),
	// 		// tbar: new Ext.Toolbar({
	// 			// items: [
	// 				// {
	// 					// xtype: 'tbbutton',
	// 					// text: 'Attach artifact...',
	// 					// id: 'attachGrid-add-button' + idAppend,
	// 					// icon: 'img/attach-16.png',
	// 					// handler: function(btn){
	// 						// attachArtifact();
	// 					// }							
	// 				// }
	// 			// ]
	// 		// }),
	// 		columns: [
	// 			{ 	
	// 				id:'attach-filename' + idAppend,
	// 				header: "Artifact",
	// 				width: 100,
	// 				dataIndex: 'filename',
	// 				sortable: true,
	// 				align: 'left',
	// 				renderer: function(value, metadata, record) {
	// 					//var returnStr = '<img src="' + getFileIcon(value) + '" width=12px height=12px>&nbsp;';
	// 					var returnStr = '<img src="' + getFileIcon(value) + '" class="sm-artifact-file-icon">';
	// 					returnStr += '<b>' + value + '</b>';
	// 					returnStr += '<br><br><b>Attached by:</b> ' + record.data.userName;
	// 					returnStr += '<br><b>Description:</b> ' + record.data.description;
	// 					returnStr += '<br><br>';
	// 					return returnStr;
	// 				}
	// 			}
	// 			,{ 
	// 				width: 25,
	// 				header: 'download', // not shown, used in cellclick handler
	// 				fixed: true,
	// 				dataIndex: 'none',
	// 				renderer: function(value, metadata, record) {
	// 					metadata.css = 'artifact-download';
	// 					metadata.attr = 'ext:qtip="Download artifact"';
	// 					return '';
	// 				}
	// 			}
	// 			,{ 
	// 				width: 25,
	// 				header: 'delete',
	// 				fixed: true,
	// 				dataIndex: 'none',
	// 				renderer: function(value, metadata, record) {
	// 					metadata.css = 'artifact-delete';
	// 					metadata.attr = 'ext:qtip="Unattach the artifact from this review"';
	// 					return '';
	// 				}
	// 			}
	// 		],
	// 		loadMask: true,
	// 		autoExpandColumn: 'attach-filename' + idAppend,
	// 		emptyText: 'No attachments to display',
	// 		listeners: {
	// 			cellclick: function (grid,rowIndex,columnIndex,e) {
	// 				//if (grid.getSelectionModel().isSelected(rowIndex)) {
	// 					var r = grid.getStore().getAt(rowIndex);
	// 					var header = grid.getColumnModel().getColumnHeader(columnIndex);
	// 					switch (header) {
	// 						case 'download':
	// 							window.location='pl/getArtifact.pl?artId=' + r.data.artId;
	// 							break;
	// 						case 'delete':
	// 							removeMap(r);
	// 							break;
	// 					}
	// 				//}
	// 			}
	// 		}
	// 	});
		

	// 	function removeMap(r) {
	// 		var confirmStr='Do you want to unattach the artifact "' + r.data.filename + '"?';
	// 		Ext.Msg.confirm("Confirm",confirmStr,function (btn,text) {
	// 			if (btn == 'yes') {
	// 				Ext.Ajax.request({
	// 					url: 'pl/removeArtifactMap.pl',
	// 					params: { 
	// 						raId: r.data.raId
	// 					},
	// 					success: function(response, request) {                               
	// 						var responseObj = Ext.util.JSON.decode(response.responseText);
	// 						if (responseObj.success) {
	// 							attachStore.remove(r);
	// 							// if (attachStore.getCount() > 0) {
	// 								// reviewForm.groupGridRecord.set('hasAttach',1);
	// 							// } else {
	// 								// reviewForm.groupGridRecord.set('hasAttach',0);
	// 							// }
	// 						}
	// 					},
	// 					failure: function(results, request) {
	// 						// if (p.maskEl != undefined) {
	// 							// p.maskEl.unmask();
	// 						// }
	// 						// alert('Error: review could not be updated.');
	// 					}
	// 				});
	// 			}
	// 		});
			
	// 	};

	// /******************************************************/
	// // End Resources Panel/Attachments
	// /******************************************************/


	/******************************************************/
	// END Resources Panel
	/******************************************************/

		var tabItems = [
			{
				region: 'west',
				layout: 'border',
				width: '40%',
				minWidth: 330,
				border: false,
				split:true,
				collapsible: false,
				id: 'west-panel' + idAppend,
				items: [
					groupGrid,
					{
						region: 'center',
						xtype: 'panel',
						split:true,
						collapsible: false,
						padding: 20,
						autoScroll: true,
						id: 'content-panel' + idAppend,
						title: 'Rule',
						tpl: contentTpl
					}
				]
			},
			{
				region: 'center',
				layout: 'border',
				border: false,
				split:true,
				collapsible: false,
				id: 'center-panel' + idAppend,
				items: [
					reviewsGrid,
					{
						region: 'south',
						xtype: 'tabpanel',
						id: 'resources-tab-panel' + idAppend,
						height: '33%',
						split:true,
						collapsible: false,
						activeTab: 'feedback-panel' + idAppend,
						items: [{
							title: 'Feedback',
							id: 'feedback-panel' + idAppend,
							layout: 'fit',
							items: rejectFormPanel
						},
						// {
						// 	title: 'Attachments',
						// 	layout: 'fit',
						// 	items: attachGrid
						// },
						{
							title: 'Metadata',
							id: 'metadata-panel' + idAppend,
							layout: 'fit',
							items: metadataGrid
						},{
							title: 'History',
							layout: 'fit',
							id: 'history-tab' + idAppend,
							items: historyData.grid
						}]
					}
				]
			}
		];
		
		var thisTab = Ext.getCmp('reviews-center-tab').add({
			id: 'collectionReviewTab' + idAppend,
			iconCls: 'sm-stig-icon',
			title: leaf.collectionName + " : " + leaf.benchmarkId,
			collectionId: leaf.collectionId,
			revId: leaf.revId,
			revisionStr: leaf.stigRevStr,
			benchmarkId: leaf.benchmarkId,
			benchmarkId: leaf.benchmarkId,
			closable:true,
			layout: 'border',
			items: tabItems,
			listeners: {
			}			
		});

		thisTab.show();

		// History is not ready for users to see
		// if (!curUser.canAdmin) {
			// Ext.getCmp('resources-tab-panel' + idAppend).hideTabStripItem('history-tab' + idAppend);
		// }
		
		groupGrid.getStore().load({
			preselect: {
				ruleId: selectedRule,
				assetId: selectedAsset
			}		
		});
		loadRevisionMenu(leaf.benchmarkId, leaf.stigRevStr, idAppend)
	}
	catch (e) {
		alert (e.message)
	}

}; //end addReview();


function renderOpen(value, metaData, record, rowIndex, colIndex, store) {
	var returnValue = value;
	if (value > 0) {
		metaData.css = 'sm-cell-red';
	} else {
		returnValue = '-';
		metaData.css = 'sm-cell-green';
	}
	return returnValue;
}

function renderCounts(value, metaData, record, rowIndex, colIndex, store) {
	var returnValue = value;
	if (value == 0) { returnValue = '-'; }
	metaData.css = 'sm-cell-grey';
	return returnValue;
}

function renderStatusCounts(value, metaData, record, rowIndex, colIndex, store) {
	var returnValue = value;
	if (value == 0) { returnValue = '-'; }
	metaData.css = 'sm-cell-status';
	return returnValue;
}