var async = require('async')
var test_cases = require("./ncgl.json")
var main = require("../index.js")

var total_grade = {
	"correct": 0, // K/V pair is correct
	"generally_correct": 0, // K correct, V == *
	"key_correct": 0, // K correct, V incorrect
	"missed": 0, // K missing
	"incorrect": 0 // K/V not in exp_result
}

async.each(test_cases,function(test,cb){
	var query = test["query"]
	var exp_result = test["tags"]

	
	main.query(query,3,function(err,result){
		console.log('Test')
		console.log('-------')
		console.log('Query: '+query)
		console.log('Expect: '+JSON.stringify(exp_result))
		console.log('Result: '+JSON.stringify(result))

		// TODO: Calculate precision and recall

		var grade = {
			"correct": 0, // K/V pair is correct
			"generally_correct": 0, // K correct, V == *
			"key_correct": 0, // K correct, V incorrect
			"missed": 0, // K missing
			"incorrect": 0 // K/V not in exp_result
		}

		Object.keys(exp_result).forEach(function(key){
			var exp_val = exp_result[key]
			
			if (key in result) {
				if (result[key] == exp_val) {
					grade['correct']++
				} else if ( result[key] == '*' ) {
					grade['generally_correct']++
				} else {
					grade['key_correct']++
				}
			} else {
				grade['missed']++
			}
		})
		Object.keys(result).forEach(function(key){
			if (! (key in exp_result)) {
				grade['incorrect']++
			}
		})
		console.log('Grade: '+JSON.stringify(grade))
		console.log()

		// Add grades to total_grade
		Object.keys(grade).forEach(function(grade_name){
			total_grade[grade_name] += grade[grade_name]
		})

		cb()
	})
}, function(){
	console.log('Total Grades')
	console.log('------------------------')
	console.log('Correct KV: '+total_grade['correct'])
	console.log('Correct K, *: '+total_grade['generally_correct'])
	console.log('Correct K, Incorrect V: '+total_grade['key_correct'])
	console.log('Missing KV: '+total_grade['missed'])
	console.log('Incorrectly identified: '+total_grade['incorrect'])
})
