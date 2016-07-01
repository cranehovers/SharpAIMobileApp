var Nightmare = require('nightmare');
var express    = require('express');        // call express
var app        = express();                 // define our app using express
var bodyParser = require('body-parser');
var path = require('path');
var mongoid = require('mongoid-js');

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var port = process.env.PORT || 8080;        // set our port
var MongoClient = require('mongodb').MongoClient;
var DB_CONN_STR = 'mongodb://127.0.0.1:3001/meteor';
var posts = null;

MongoClient.connect(DB_CONN_STR, function(err, db) {
    if (err) {
        console.log('Error:' + err);
        return;
    }
    posts = db.collection('posts');
});
var insert_data = function(id, url, data, cb) {
    if (!id || !data || !url || !posts) {
      console.log('Error: null of id or data');
      if(cb){
          cb('error',null)
      }
      return;
    }

    if(data.resortedArticle.length > 0){
      for(var i=0;i<data.resortedArticle.length;i++){
        if(data.resortedArticle[i].type === 'image')
          data.resortedArticle[i].isImage = true;
        data.resortedArticle[i]._id = id + i;
        // data.resortedArticle[i].data_row = ;
        // data.resortedArticle[i].data_col = ;
        // data.resortedArticle[i].data_sizex = ;
        // data.resortedArticle[i].data_sizey = ;
      }
    }
    
    var data_insert = [{
      '_id':id+'_'+mongoid(),
      'ownerId': id,
      'pub': data.resortedArticle,
      'title': data.title,
      'browse': 0,
      'heart': [],
      'retweet': [],
      'comment': [],
      'commentsCount': 0,
      'addontitle': [],
      'mainImage': data.imageArray[0],
      'mainImageStyle': [],
      'mainText': [],
      'fromUrl': url,
      'status':'importing',
      'publish': true
      }];

    posts.insert(data_insert, function(err, result) {
      if(err || !result.insertedCount || !result.insertedIds || !result.insertedIds[0]) {
        console.log('Error:'+ err);
        if(cb){
          cb(err,null)
        }
        return null;
      }
      console.log(result.insertedIds[0]);
      if(cb){
          cb(null,result.insertedIds[0])
      }
    });
}

// ROUTES FOR OUR API
// =============================================================================
var router = express.Router();              // get an instance of the express Router

// test route to make sure everything is working (accessed at GET http://localhost:8080/api)
router.get('/', function(req, res) {
  res.json({ message: 'hooray! welcome to our api!' });
});

// more routes for our API will happen here
router.route('/:_id/:url')
    .get(function(req, res) {
      console.log('_id=' + req.params._id + ' url=' + req.params.url);
      var nightmare = Nightmare({ show: true , openDevTools: true});
      nightmare
          .goto(req.params.url)
          .inject('js','bundle.js')
          .wait('#detected_json_from_gushitie')
          .evaluate(function () {
            return window.detected_json_from_gushitie
          })
          .end()
          .then(function (result) {
            //console.log(result)
            if(!req.state){
              req.state = true

              insert_data(req.params._id, req.params.url, result, function(err,postId){
                if (err) {
                  console.log('Error: insert_data failed');
                  res.json({status:'failed'});
                  return;
                }
                console.log('Post id is: '+postId);

                res.json({status:'succ',json:'http://cdn.tiegushi.com/posts/'+postId});
              });
            }
          })
          .catch(function (error) {
            res.json({status:'failed'});
            console.error('Search failed:', error);
          })
    });
// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/import', router);

// START THE SERVER
// =============================================================================
app.listen(port);

console.log('Magic happens on port ' + port);