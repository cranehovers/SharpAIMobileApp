var Nightmare = require('nightmare');
var express    = require('express');        // call express
var app        = express();                 // define our app using express
var bodyParser = require('body-parser');
var path = require('path');
var mongoid = require('mongoid-js');
var filedownup = require('./file_downupload.js');
var drafts = require('./post_drafts.js');
var geoip = require('geoip-lite');
var http = require('http');

var showDebug = true;

var port = process.env.PORT || 8080;        // set our port
var hotshare_web = process.env.HOTSHARE_WEB_HOST || 'http://cdn.tiegushi.com';
var MongoClient = require('mongodb').MongoClient;
var DB_CONN_STR = process.env.MONGO_URL || 'mongodb://hotShareAdmin:aei_19056@host1.tiegushi.com:27017/hotShare';
var posts = null;
var users = null;
var Follower = null;
var FollowPosts = null;
var Feeds = null;

var kue = require('kue'), 
    cluster = require('cluster'),
    clusterWorkerSize = require('os').cpus().length,
    kuequeue;/* = kue.createQueue({
         //prefix: redis_prefix,
         redis: {
             port: 6379,
             host: 'urlanalyser.tiegushi.com',
             auth: 'uwAL539mUJ'
         }});*/
var NIGHTMARE_DEBUG = false;
var QUEUE_SIZE = 100;
var nightmareQueue;
var redis_prefix = process.env.PREFIX+'import_task';
var redis_prefix_us = process.env.PREFIX+'import_task_us';
var restartKueServiceTimeout = null;

process.addListener('uncaughtException', function (err) {
  if (!err) {
    err = {};
  }
  var msg = err.message;
  if (err.stack) {
    msg += '\n' + err.stack;
  }
  if (!msg) {
    msg = JSON.stringify(err);
  }
  if (cluster.isMaster) {
    console.log("uncaughtException on Master");
  } else {
    console.log("uncaughtException on Slaver");
  }
  console.log("uncaughtException: err="+JSON.stringify(err));
  console.log(msg);
  console.trace();
  if (err.message && err.message.toLowerCase().startsWith("redis")) {
    if (restartKueServiceTimeout) {
        clearTimeout(restartKueServiceTimeout);
        restartKueServiceTimeout = null;
    }

    restartKueServiceTimeout = setTimeout(function(){
                                if (cluster.isMaster) {
                                    for (var id in cluster.workers) {
                                        console.log("Sending message restartKueService to work id: "+id);
                                        cluster.workers[id].send('restartKueService');
                                    }
                                }
                                restartKueService();
                            }, 10000);
  }
});

function getUrl(url) {
    if (url) {
        var tmpUrl = url.trim().toUpperCase();
        if ((tmpUrl.indexOf("HTTP://") == 0) || (tmpUrl.indexOf("HTTPS://") == 0)) {
            return url.trim();F
        } else {
            return 'http://'+url.trim();
        }
    }
    return '';
}

function checkIPAddr(ip) {
    if (!ip) {
        return 'CN';
    }
    var geo = geoip.lookup(ip);
    console.log("geo = "+JSON.stringify(geo));
    if (geo && geo.country == 'US') {
        return 'US'
    }
    return 'CN';
}


/*Kue relative process*/
function startKueService() {
    kuequeue = kue.createQueue({
             //prefix: redis_prefix,
             redis: {
                 port: 6379,
                 host: 'urlanalyser.tiegushi.com',
                 auth: 'uwAL539mUJ'
             }});
    if (cluster.isMaster) {
        console.log("!!!!!!!!!! startKueService: Master...");
    } else {
        console.log("!!!!!!!!!! startKueService: Slaver...");
        setKueProcessCallback();
    }
}
function restartKueService() {
    if (kuequeue) {
        var timeout = 5000;
        kuequeue.shutdown(Number(timeout), function () {
            if (cluster.isMaster) {
                console.log("!!!!!!!!!! restartKueService: Master, shutdown kue queue service! Start again...");
            } else {
                console.log("!!!!!!!!!! restartKueService: Slaver, shutdown kue queue service! Start again...");
            }
            kuequeue = null;
            startKueService();
        });
    }
}
function createTaskToKueQueue(prefix, _id, url, server, chunked) {
    var job = kuequeue.create(prefix, {
      id: _id,
      url: getUrl(url),
      server: server,
      chunked: chunked
    }).save(function(err){
      if (!err) {
        console.log("   job.id = "+job.id);
      }
      showDebug && console.log(']');
    });
    return job;
}
function setKueProcessCallback() {
  function process_callback(job, done){
    showDebug && console.log('------- Start --------');
    console.log('worker', cluster.worker.id, 'queue.process', job.data);
    var data = job.data;
    var _id = data.id;
    var url = data.url;
    var server = data.server;
    var chunked = data.chunked;

    importUrl(_id, url, server, chunked, function(result) {
      //setTimeout(function() { done(); }, jobDelay);
      console.log('result='+JSON.stringify(result));
      if (result.status == 'succ') {
        job.progress(100, 100, JSON.stringify(result));
        done();
      } else if (result.status == 'importing') {
        job.progress(50, 100, JSON.stringify(result));
      } else {
        done(new Error('failed'));
      }
    });
  }

  if (!process.env.SERVER_IN_US) {
    console.log("cluster Slaver: CN");
    kuequeue.process(redis_prefix, QUEUE_SIZE, process_callback);
  } else {
    console.log("cluster Slaver: US");
    kuequeue.process(redis_prefix_us, QUEUE_SIZE, process_callback);
  }
}


/*nightmare queue relative process*/
function initQueueMember(queueMember) {
    queueMember.status = "NONE";
    queueMember.nightmare = Nightmare({ show: NIGHTMARE_DEBUG , openDevTools: NIGHTMARE_DEBUG, waitTimeout: 30000});
    showDebug && console.log("initQueueMember: init a nightmare. index="+queueMember.index);
}
function initNightmareQueue() {
    var queue = new Array(QUEUE_SIZE);
    for (var i=0; i<QUEUE_SIZE; i++) {
        queue[i] = {};
        queue[i].index = i;
        if (i < 10) {
            initQueueMember(queue[i]);
        }
    }
    showDebug && console.log("initNightmareQueue: inititalized "+QUEUE_SIZE+" nightmares.");
    return queue;
}
function getIdleNightmare(queue, callback, tryingCount) {
    var tryGetIdleNightmare = function () {
        for (var i=0; i<QUEUE_SIZE; i++) {
            if (!queue[i].nightmare) {
                queue[i].index = i;
                initQueueMember(queue[i]);
                return queue[i];
            } else if (queue[i].status == "NONE") {
                showDebug && console.log("getIdleNightmare: get one idle nightmare, i="+i);
                queue[i].status = "BUSY"
                return queue[i];
            }
        }
        return null;
    }

    if (tryingCount > 20) {
        if (callback) {
            callback(queueMember);
        }
        return;
    }

    var queueMember = tryGetIdleNightmare();
    if (queueMember == null) {
        setTimeout(function(){
            getIdleNightmare(queue, callback, tryingCount+1);
        }, 1000);
    } else {
        if (callback) {
            callback(queueMember);
        }
    }
}
function finishNightmare(queueMember) {
    if (queueMember && queueMember.nightmare) {
        queueMember.status = "NONE";
        showDebug && console.log("finishNightmare: finish using nightmare. index="+queueMember.index);
    } else {
        showDebug && console.log("Error: finishNightmare no nightmare.");
    }
}


/*database relative process*/
MongoClient.connect(DB_CONN_STR, function(err, db) {
    if (err) {
        console.log('Error:' + err);
        return;
    }
    posts = db.collection('posts');
    users = db.collection('users');
    Follower = db.collection('follower');
    FollowPosts = db.collection('followposts');
    Feeds = db.collection('feeds');
});
var postsInsertHookDeferHandle = function(userId,doc){
    var suggestPostsUserId;
    try{
        suggestPostsUserId = users.findOne({'username': 'suggestPosts' })._id;
    } catch(error) {
    }
    try{
        Follower.find({followerId:userId}).toArray(function(err, follows) {
            var follows_length = follows.length;
            console.log("userId="+userId+", follows.length="+follows.length);
            if(follows_length>0){                  
                follows.forEach(function(data){
                    if(data.userId === suggestPostsUserId)
                    {
                        FollowPosts.insert({
                            _id:doc._id,
                            postId:doc._id,
                            title:doc.title,
                            addontitle:doc.addontitle,
                            mainImage: doc.mainImage,
                            mainImageStyle:doc.mainImageStyle,
                            heart:0,
                            retweet:0,
                            comment:0,
                            browse: 0,
                            publish: doc.publish,
                            owner:doc.owner,
                            ownerName:doc.ownerName,
                            ownerIcon:doc.ownerIcon,
                            createdAt: doc.createdAt,
                            followby: data.userId
                        });
                    }
                    else
                    {
                        FollowPosts.insert({
                            postId:doc._id,
                            title:doc.title,
                            addontitle:doc.addontitle,
                            mainImage: doc.mainImage,
                            mainImageStyle:doc.mainImageStyle,
                            heart:0,
                            retweet:0,
                            comment:0,
                            browse: 0,
                            publish: doc.publish,
                            owner:doc.owner,
                            ownerName:doc.ownerName,
                            ownerIcon:doc.ownerIcon,
                            createdAt: doc.createdAt,
                            followby: data.userId
                        });
                    }

                    Feeds.insert({
                        owner:doc.owner,
                        ownerName:doc.ownerName,
                        ownerIcon:doc.ownerIcon,
                        eventType:'SelfPosted',
                        postId:doc._id,
                        postTitle:doc.title,
                        mainImage:doc.mainImage,
                        createdAt:doc.createdAt,
                        heart:0,
                        retweet:0,
                        comment:0,
                        followby: data.userId
                    });
                    //pushnotification("newpost",doc,data.userId);
                    dataUser = users.findOne({_id:data.userId})
                    waitReadCount = dataUser && dataUser.profile && dataUser.waitReadCount ? dataUser.profile.waitReadCount : 0;
                    if(waitReadCount === undefined || isNaN(waitReadCount))
                    {
                        waitReadCount = 0;
                    }
                    users.update({_id: data.userId}, {$set: {'profile.waitReadCount': waitReadCount+1}});
                });
            }
            if(userId === suggestPostsUserId)
            {    
                console.log("22222");               
                FollowPosts.insert({
                    _id:doc._id,
                    postId:doc._id,
                    title:doc.title,
                    addontitle:doc.addontitle,
                    mainImage: doc.mainImage,
                    mainImageStyle:doc.mainImageStyle,
                    heart:0,
                    retweet:0,
                    comment:0,
                    browse: 0,
                    publish: doc.publish,
                    owner:doc.owner,
                    ownerName:doc.ownerName,
                    ownerIcon:doc.ownerIcon,
                    createdAt: doc.createdAt,
                    followby: userId
                });
            }
            else
            {         
                FollowPosts.insert({
                    postId:doc._id,
                    title:doc.title,
                    addontitle:doc.addontitle,
                    mainImage: doc.mainImage,
                    mainImageStyle:doc.mainImageStyle,
                    heart:0,
                    retweet:0,
                    comment:0,
                    browse: 0,
                    publish: doc.publish,
                    owner:doc.owner,
                    ownerName:doc.ownerName,
                    ownerIcon:doc.ownerIcon,
                    createdAt: doc.createdAt,
                    followby: userId
                });
            }
        });
    }
    catch(error){}
    /*try {
        var pullingConn = Cluster.discoverConnection("pulling");
        pullingConn.call("pullFromServer", doc._id);
    }
    catch(error){}*/
};
var insert_data = function(user, url, data, cb) {
    if (!user || !data || !url || !posts) {
      console.log('Error: null of id or data');
      if(cb){
          cb('error',null)
      }
      return;
    }

    if (data.resortedArticle && data.resortedArticle.length > 0){
      for(var i=0;i<data.resortedArticle.length;i++){
        data.resortedArticle[i]._id = mongoid();
        if(data.resortedArticle[i].type === 'image')
          data.resortedArticle[i].isImage = true;
        data.resortedArticle[i].data_row = 1;
        data.resortedArticle[i].data_col = 1;
        data.resortedArticle[i].data_sizex = 6;
        data.resortedArticle[i].data_sizey = 1;
      }
    }
    
    filedownup.EalyMainImage(data, function (mainImageURL) {
      var data_insert = [{
        '_id':mongoid(),
        'ownerId': user._id,
        'pub': data.resortedArticle,
        'title': data.title,
        'browse': 0,
        'heart': [],
        'retweet': [],
        'comment': [],
        'commentsCount': 0,
        'addontitle': [],
        'mainImage': mainImageURL ? mainImageURL : 'http://data.tiegushi.com/res/defaultMainImage1.jpg',
        'mainImageStyle': [],
        'mainText': [],
        'fromUrl': url,
        'status':'importing',
        'owner':user._id,
        'ownerName':user.profile.fullname || user.username,
        'ownerIcon':user.profile.icon || '/userPicture.png',
        'createdAt': new Date(),
        'publish': true,
        'appEdited': false
        }];

      posts.insert(data_insert, function(err, result) {
        if(err || !result.insertedCount || !result.insertedIds || !result.insertedIds[0]) {
          console.log('Error:'+ err);
          if(cb){
            cb(err,null)
          }
          return null;
        }
        console.log("data_insert[0]._id="+data_insert[0]._id);
        showDebug && console.log("posts.insert: "+result.insertedIds[0]);
        //postsInsertHookDeferHandle(user._id, data_insert[0]);
        if(cb){
            cb(null,result.insertedIds[0])
        }
      });
    });
}
var updatePosts = function(postId, post, callback){
  post.status = 'imported';
  post.appEdited = true;
  posts.update({_id: postId},{$set: post}, function(err, number){
    callback && callback(err, number);
  });
};
var updateFollowPosts = function(userId, postId, post, callback){
  //console.log("userId="+userId+", postId="+postId+", post="+JSON.stringify(post));
  FollowPosts.update({followby:userId, postId:postId}, {$set: {
                    mainImage: post.mainImage,
                    mainImageStyle:post.mainImageStyle,
                    publish: post.publish,
                    owner:post.owner,
                    ownerName:post.ownerName,
                    ownerIcon:post.ownerIcon,
                }
            }, function(err, number){
    callback && callback(err, number);
  });
};


var httpget = function(url) {
    http.get(url, function(res) {
        showDebug && console.log('httpget suc: url='+url+', response: ${res.statusCode}');
        showDebug && console.log('------- End --------');
        // consume response body
        res.resume();
    }).on('error', function(err) {
        showDebug && console.log('httpget failed: url='+url+', error: ${e.message}');
        showDebug && console.log('------- End --------');
    });
}

function importUrl(_id, url, server, chunked, callback) {
  switch (arguments.length) {
    case 2:
      chunked = false;
      break;
    case 3:
      //callback = chunked;
      chunked = false;
      break;
  }

  var userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 8_2 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) Mobile/12D508 (5752533504)';   //iPhone 8.2 Safari UA
  //var userAgent = 'Mozilla/5.0 (iPhone; U; CPU iPhone OS 8_2 like Mac OS X; en) AppleWebKit/534.46.0 (KHTML, like Gecko) CriOS/19.0.1084.60 Mobile/9B206 Safari/7534.48.3'; //Chrome UA on iPhone
  //var userAgent = 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Electron/1.2.5 Safari/537.36'; //Chrome on Macbook
  
  var chunked_result = {};
  if(chunked){
    chunked_result.status = 'importing';
    chunked_result.json = {
      title: url,
      mainImg: 'http://data.tiegushi.com/res/defaultMainImage1.jpg',
      remark: '[内容分析中...]'
    };
    callback(chunked_result);
    
    var nightmare_header = Nightmare({ show: false , openDevTools: false});
    nightmare_header
      .useragent(userAgent + ' (GetHeader)')
      .goto(url)
      .inject('js','bundle.js')
      .wait('#detected_json_from_header')
      .evaluate(function () {
        return window.detected_json_from_header;
      })
      .end()
      .then(function (result) {
        if(chunked_result.status != 'failed' && chunked_result.status != 'succ'){
          chunked_result.status = 'importing';
          chunked_result.json.title = result.title || '[暂无标题]';
          chunked_result.json.mainImg = result.mainImg || 'http://data.tiegushi.com/res/defaultMainImage1.jpg';
          chunked_result.json.remark = result.remark || '[暂无介绍]';
          callback(chunked_result);
        }
      });
  }
  
  //var nightmare = Nightmare({ show: false , openDevTools: false, waitTimeout: 30000});
  function startNavigation(queueMember) {
      if (!queueMember) {
        if (callback) {
          console.log("    !!!!!!Error: can't get nightmare from queue!");
          chunked_result.status = 'failed';
          callback({status: 'failed'});
        }
        return;
      }
      var index = queueMember.index;
      var nightmare = queueMember.nightmare;
      nightmare
          .useragent(userAgent)
          .goto(url)
          .inject('js','bundle.js')
          .wait('#detected_json_from_gushitie')
          .evaluate(function () {
            return window.detected_json_from_gushitie
          })
          //.end()
          .then(function (result) {
              //console.log("result="+JSON.stringify(result));
              console.log("nightmare finished, insert data and parse it...");
              users.findOne({_id: _id}, function (err, user) {
                if(err || !user)
                  if (callback) {
                    console.log("user not found, err="+err);
                    chunked_result.status = 'failed';
                    callback({status:'failed'});
                    return;
                  }

                insert_data(user, url, result, function(err,postId){
                  if (err) {
                    console.log('Error: insert_data failed');
                    chunked_result.status = 'failed';
                    callback({status:'failed'});
                    return;
                  }
                  showDebug && console.log('Post id is: '+postId);
                  
                  // 图片的下载及排版计算
                  var draftsObj = new drafts.createDrafts(postId, user);
                  draftsObj.onSuccess(function(){
                    draftsObj.uploadFiles(function (err) {
                      if(err)
                        return console.log('upload file error.');
                        
                      var postObj = draftsObj.getPubObject();
                      // console.log('post:', JSON.stringify(postObj));
                      // draftsObj.destroy();
                      
                      // update pub
                      updatePosts(postId, postObj, function(err, number){
                        if(err || number <= 0)
                          return console.log('import error.');
                          
                          var tmpServer = hotshare_web;
                          if (server && (server != '')) {
                            if (server.charAt(server.length - 1) == '/')
                              tmpServer = server.substring(0, server.length - 1);
                          }
                          var url = tmpServer+'/restapi/postInsertHook/'+user._id+'/'+postId;
                          console.log("httpget url="+url);
                          httpget(url);
                      });                 
                      
                      // updatePosts(postId, postObj, function(err, number){
                      //   if(err || number <= 0) {
                      //     showDebug && console.log('database update error!');
                      //     showDebug && console.log('------- End --------');
                      //   } else {
                      //       var tmpServer = hotshare_web;
                      //       if (server && (server != '')) {
                      //           if (server.charAt(server.length - 1) == '/') {
                      //               tmpServer = server.substring(0, server.length - 1);
                      //           }
                      //       }
                      //       var url = tmpServer+'/restapi/postInsertHook/'+user._id+'/'+postId;
                      //       console.log("httpget url="+url);
                      //       httpget(url);
                      //   }
                      // });
                      
                      
                      /*updateFollowPosts(user._id, postId, postObj, function(err, number){
                        if(err || number <= 0)
                          console.log('import error.');
                      });*/
                    });
                  });
                  draftsObj.seekOneUsableMainImage(result, url);
      
                  // send response
                  if (callback) {
                    chunked_result.status = 'succ';
                    if (hotshare_web)
                    chunked_result.json = hotshare_web+'/posts/'+postId;
                    callback({status:'succ',json:hotshare_web+'/posts/'+postId});
                  }
                });
              });

              nightmare.goto("about:blank").then(function (result) {
                console.log("Open blank page.");
                finishNightmare(queueMember);
              });
              //console.log("nightmare.then: index="+index);
              //initQueueMember(queueMember);
          })
          .catch(function (error) {
            if (callback) {
              chunked_result.status = 'failed';
              callback({status:'failed'});
            }
            nightmare.end(function() {
                console.log("end nightmare, index="+index);
            });
            console.log("nightmare.catch: index="+index);
            initQueueMember(queueMember);
            console.error('Search failed:', error);

          })
  }
  getIdleNightmare(nightmareQueue, startNavigation, 0);
}


if (cluster.isMaster) {
  console.log("clusterWorkerSize="+clusterWorkerSize);
  for (var i = 0; i < clusterWorkerSize; i++) {
    cluster.fork();
    console.log("cluster master fork: i="+i);
  }
  cluster.on('exit', function(worker, code, signal) {
    console.log('Worker ' + worker.id + ' died..');
    cluster.fork();
  });
  cluster.on('disconnect', function() {
    console.log('Frank Worker disconnect..');
  });
  if (process.env.isClient) {
    console.log("Master: work only for slaver mode.");
    return;
  } else {
    console.log("cluster work both for Master and slaver mode.");
  }

  var router = express.Router();
  router.get('/', function(req, res) {
    res.json({ message: 'hooray! welcome to our api!' });
  });

  router.route('/:_id/:url')
    .get(function(req, res) {
      var chunked = req.query['chunked'] && req.query['chunked'] === 'true' ? true : false;;
      showDebug && console.log('[');
      showDebug && console.log('  _id=' + req.params._id + ', url=' + req.params.url);
      showDebug && console.log('   req.query=' + JSON.stringify(req.query));
      //importUrl(req.params._id, req.params.url, res.json);
      var job;
      var ip = req.query.ip;
      var server = req.query.server;
      if (!server) {
        server = '';
      }
      if (checkIPAddr(ip) == 'CN') {
        console.log("   create task for CN");
        job = createTaskToKueQueue(redis_prefix, req.params._id, req.params.url, server, chunked);
        
      } else {
        console.log("   create task for US");
        job = createTaskToKueQueue(redis_prefix_us, req.params._id, req.params.url, server, chunked);
      }

      job.on('complete', function(result){
        console.log('Job completed with data', result);
      }).on('failed attempt', function(errorMessage, doneAttempts){
        console.log('Job attempt failed');
        res.end(JSON.stringify({status:'failed'}));
      }).on('failed', function(errorMessage){
        console.log('Job failed');
        res.end(JSON.stringify({status:'failed'}));
      // }).on('importing', function(result){
      //   console.log('Job result');
      //   res.write(JSON.stringify(result));
      }).on('progress', function(progress, data){
        console.log('\r  job #' + job.id + ' ' + progress + '% complete with data ', data);
        if (progress == 100) {
          res.end(data);
        }else {
          res.write(data);
        }
      });
    });

  startKueService();
  app.use(bodyParser.urlencoded({extended: true}));
  app.use(bodyParser.json());
  app.use('/import', router);
  app.listen(port);
  console.log('Magic happens on port ' + port);
} else {
  //process.on('message', (msg) => {
  process.on('message', function(msg) {
    //process.send(msg);
    if (msg === 'restartKueService') {
      console.log("Received restartKueService message from Master.");
      //restartKueService();
      process.exit(0);
    }
  });
  nightmareQueue = initNightmareQueue();
  startKueService();
}
