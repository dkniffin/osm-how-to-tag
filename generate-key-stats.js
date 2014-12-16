var taginfo = require('./lib/taginfo')
, async = require('async')
, merge = require('merge')

var prob_matrix = [];

var filters = {
	isASCII: function(key,cb) {
    	cb(/^[\x00-\x7F]*$/.test(key.key));
	},
	englishPageWithDescription: function(p,filter_cb){
		filter_cb(p.lang == 'en' && p.description != '') // Only English pages
	}
}


function printJSON(err,obj){
	console.log(JSON.stringify(obj))
}
function reduceResults(err, results){
	async.reduce(results,{},function(memo,item,cb){
		setImmediate(function(){
			cb(null,merge(memo,item))
		})
	}, function(err,result){
		console.log(JSON.stringify(result))
	})

}

/*======================================
Get stats, including the description from the wiki, for each key
======================================*/
taginfo.keys.all(function(data){ // For all wiki pages
	async.filter(data.data,filters.isASCII,function(result){
		async.map(result, function(item,map_cb){
			setImmediate(function(){ // clear the call stack
				var key = item.key
				var obj = {}
				if (item.in_wiki) {
					taginfo.key.wiki_pages(key,function(pages){ // For each wiki page for the given key
						async.filter(
							pages,
							filters.englishPageWithDescription,
							function(en_pages){
								setImmediate(function(){
									if (typeof en_pages[0] == 'undefined') {
										obj[key] = merge(item,{ description: '' })
										map_cb(null, obj)
									} else {
										obj[key] = merge(item,{ description: en_pages[0].description })
										map_cb(null,obj) // Add the key's description

									}
								})
							}
						)
					})
				} else {
					obj[key] = merge(item,{ description: '' })
					map_cb(null,obj)
				}
			})
		}, reduceResults)
	})
})



