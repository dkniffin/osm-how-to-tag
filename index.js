var async = require('async')
, fs = require('fs')
// Sigh...getting the right merge module was a pain in the neck.
// There are about 10 different modules that do essentially the
// same thing, with very minor differences.
, merge = require('deepmerge')
, _ = require('lodash')

// Some NLP libraries and setup of them
, natural = require('natural')
, wordnet = new natural.WordNet('/tmp/dict/')
, tokenizer = new natural.RegexpTokenizer({pattern: /\-/});

// Augment array to include a max function
Array.prototype.max = function() {
  return Math.max.apply(null, this);
};

// Async helper functions
var ahelp = {
	'reduce': {
		'merge': function(memo,item,cb){
			setImmediate(function(){ // Clear the call stack
				cb(null,merge(memo,item,{ alwaysPush : true }))
			})
		},
		'concat': function(memo,item,cb){
			setImmediate(function(){ // Clear the call stack
				cb(null,memo.concat(item))
			})
		}
	},
	'reject': {
		'undefined': function(item,cb){
			cb(item == undefined)
		}
	}
}

function chomp(str){
	return str.replace(/\s+/g,"")
}
// Split a string into tokens
// http://en.wikipedia.org/wiki/Tokenization_(lexical_analysis)
function tokenize(str) {
	var reserved = ['constructor']
	if (chomp(str) == ''){ return [] }
	// First, replace all punctuation with spaces
	// Then, split on spaces
	natural.PorterStemmer.attach();
	var words = str.tokenizeAndStem()
	//var words = str.replace(/[\.,-\/#!$%\^&\*;:{}=\-_`~()\'\"\[\]]/g," ").match(/\S+/g)

	if (words == null) { return []}
	// Avoid reserved words
	words.forEach(function(word,i){
		if (reserved.indexOf(word) >= 0) {
			words[i] = 'word_' + word
		}
	})
	return words
}




// -----------------------------------------------------------------------
// Retrieve and/or build word map
// -----------------------------------------------------------------------

// Include the OSM key and value stats objects
// To build these, use generate-key-stats.js and generate-tag-stats.js
var key_stats = require('./key-stats.json')
var tag_stats = require('./tag-stats.json')

// Get the word map (word => OSM key/value pairs)
function getWordMap(cb){
	// Check if the wordmap is already created on disk
	fs.exists('./wordmap.json',function(exists){
		if (! exists){
			// Otherwise, build it, and write it to the filesystem
			buildWordMap(function(err,wm){
				console.log('writing to file')
				fs.writeFile("./wordmap.json", JSON.stringify(wm))
				cb(null,wm)
			})
		} else {
			// If the wordmap is already created, simply import it
			cb(null,require('./wordmap.json'))
		}
	})
}

// Build the word map
function buildWordMap(bcb) {
	async.waterfall([
		function(callback){
			// Add key_stats descriptions to wordmap
			async.map(Object.keys(key_stats), function(key,map_cb){
				// Tokenize the key's description
				var words = tokenize(key_stats[key].description)
				// Add the actual keys to the list of words
				//words = words.concat(tokenize(key))
				// Create a wordmap from the description words to the key object
				map_cb(null,wordMap(words,key_stats[key],'key_description'))
			},callback)
		},
		function(resultset,callback){
			// Add tag_stats descriptions to word map
			async.map(Object.keys(tag_stats), function(kv,map_cb){
				// Tokenize the tag (k/v pair) description
				var words = tokenize(tag_stats[kv].description)
				
				// Create a wordmap from the description words to the tag object
				map_cb(null,wordMap(words,tag_stats[kv],'tag_description'))
			},function(err,wm){
				
				callback(null,resultset.concat(wm))
			})
		},
		function(resultset,callback){
			// Add key_stats descriptions to word map
			async.map(Object.keys(key_stats), function(key,map_cb){
				// Tokenize the actual keys
				var words = tokenize(key)
				// Create a wordmap from the description words to the tag object
				map_cb(null,wordMap(words,key_stats[key],'key'))
			},function(err,wm){
				
				callback(null,resultset.concat(wm))
			})
		},
		function(resultset,callback){
			// Add tag_stats descriptions to word map
			async.map(Object.keys(tag_stats), function(kv,map_cb){
				// Tokenize the actual tags
				var words = tokenize(tag_stats[kv].value)
				// Create a wordmap from the description words to the tag object
				map_cb(null,wordMap(words,tag_stats[kv],'tag'))
			},function(err,wm){
				
				callback(null,resultset.concat(wm))
			})
		},
		function(resultset,callback){
			console.log('reducing')
			// Merge the results and send them to the callback
			// async.reduce(resultset,{},ahelp['reduce']['merge'],function(err,results){
			// 	console.log('done reducing')
			// 	callback(err,results)
			// })
			var wordmap = {}
			// For each word in the wordmap
			async.each(resultset,function(wm,cb){
				async.each(Object.keys(wm),function(word,cb2){
					if (typeof wordmap[word] == 'undefined') {
						wordmap[word] = []
					}
					wordmap[word] = wordmap[word].concat(wm[word])
					cb2()
				},function(){
					cb()
				})
			},function(){
				callback(null,wordmap)
			})
		}
	],bcb)
}

// Given words, and an OSM tag object
//  return a "mini" word map of those words to that object
function wordMap(words,tagObj,type) {
	if (typeof tagObj.value == 'undefined') { // if only two arguments were supplied
		tagObj.value = '*'
	}


	// TODO: Implement some sort of synonym logic
	// words.forEach(function(word,i,array){
	// 	wordnet.lookup(word, function(results) {
	// 	    results.forEach(function(result) {
	// 	    	words = words.concat(result.synonym)
	// 	    })
	// 	})
	// })

	words = _.uniq(words)

	var map = {}
	words.forEach(function(word,i,array){
		if (typeof map[word] == 'undefined') {
			map[word] = []
		}

		map[word].push({
			'key':tagObj.key,
			'value':tagObj.value,
			'frac':tagObj.count_all_fraction,
			'k=v': tagObj.key+'='+tagObj.value,
			'type': type
		})

	})
	return map
}


// -----------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------

function likelihood(obj){
	// Add a value indicating the likelihood of the tag matching
	var weight = 1

	switch(obj.type){
		case 'tag_description':
			weight = 4
			break;
		case 'tag':
			weight = 3
			break;
		case 'key_description':
			weight = 2
			break;
		case 'key':
			weight = 1
			break;
	}


	return obj['frac'] + (obj['count'] * weight)
}

function probDesc(a,b){
	return b.likelihood - a.likelihood;
}

function prettifyResults(item,cb){
	var pretty = {}
	pretty[item.key] = item.value
	//pretty[item.key+'_likelihood'] = item.likelihood
	cb(null,pretty)
	//cb(null,item)
}

// Get the best OSM tags, based on the given query string
exports.query = function(query,numResults,qcb) {
	async.waterfall([
		function(callback){
			// Get the word map
			getWordMap(callback)
		},
		function(wm,callback){
			// Tokenize the query
			var words = tokenize(query)
			// Map the words to their tag objects
			async.map(words,function(word,cb){
				var tagObj = wm[word]
				// TODO: Figure out what to do if the word in the query is not in the word map
				cb(null,tagObj)
			},callback)
		},
		function(results,callback){
			// Filter out undefined items
			async.reject(results,ahelp['reject']['undefined'],function(filter_results){
				callback(null,filter_results)
			})
		},
		function(results,callback){
			// Reduce to a set of tags (duplicates are okay)
			async.reduce(results,[],ahelp['reduce']['concat'],callback)
		},
		function(results,callback){
			// Count up the number of times a given tag is returned
			var tag_map = {}
			async.each(results,function(tagObj,cb){
				var k = tagObj.key + '=' + tagObj.value
				tag_map[k] = (typeof tag_map[k] == 'undefined') ? 1 : tag_map[k] + 1
				cb()
			},function(err){
				// Unique the results
				var uniq_results = _.uniq(results, 'k=v')
				// Add the count to the tagObj, as well as the likelihood rating
				async.each(uniq_results,function(tagObj,cb){
					var kv = tagObj.key + '=' + tagObj.value
					tagObj['count'] = tag_map[kv]
					tagObj['likelihood'] = likelihood(tagObj)
					cb()
				},function(err){
					callback(null,uniq_results)
				})
			})
		},
		function(results,callback){
			// Print out the top # best guesses
			var top = results.sort(probDesc).slice(0,numResults)
			// Return prettied results
			async.map(top,prettifyResults,callback)
		},
		function(results,callback){
			async.reduce(results,{},ahelp['reduce']['merge'],callback)
		}
	],qcb)
}

// getWordMap(function(err,wm){
// 	console.log(wm['take'])
// })
// Testing
exports.query('house number',3,function(err,results){
	console.log(results)
})