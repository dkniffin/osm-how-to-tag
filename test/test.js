var assert = require("assert")
var test_cases = require("./ncgl.json")
var main = require("../index.js")

test_cases.forEach(function(test){
  console.log(test)
  var query = test["query"]
  var result = test["tags"]
  describe("Query: " + query, function(){
    it('should return the correct tagset', function(){
      assert.equal(main.query(query), result)
    })
  })
})
