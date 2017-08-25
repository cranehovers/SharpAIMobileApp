var lazyTimelineImg = function(){
  console.log('Inetrval call')
  $("img.lazy").lazyload({
    threshold : 100
  });
  $('img.lazy').load(function() {
    console.log($(this).attr('src') + ' loaded');
    var self = $(this);
    if(self.attr('data-original') == self.attr('src')){
      self.addClass('img-loaded').removeClass('lazy');
    }
  });
}
Template.timelineAlbum.onRendered(function(){
  var taId = Router.current().params.query.taId;
  if(taId){
    Meteor.subscribe('usersById',taId);
    Meteor.subscribe('get-workai-user-relation',taId);
  }
  Session.set('timelineAlbumMultiSelect',false);
  Session.set('timelineAlbumLimit',10);
  var uuid = Router.current().params._uuid;
  Session.set('timelineAlbumLoading',true);
  var hour = Session.get('wantModifyTime');
  if (hour) {
    Session.set('timelineAlbumGteLimit',0); //大于某段时间的
    Meteor.subscribe('device-timeline-with-hour',uuid,{$lte:hour},-1,Session.get('timelineAlbumLimit'),function(){
      Session.set('timelineAlbumLoading',false);
    });
  }
  else{
    Meteor.subscribe('device-timeline',uuid,Session.get('timelineAlbumLimit'),function(){
      Session.set('timelineAlbumLoading',false);
    });
  }
  var isLoadMore = false;
  $('.content').scroll(function(){
    var height = $('.timeLine').height();
    var contentTop = $('.content').scrollTop();
    var contentHeight = $('.content').height();
    console.log(contentTop+contentHeight)
    console.log(height)
    // if(timelineAlbumTimeout){
    //   window.clearTimeout(timelineAlbumTimeout);
    // }
    // timelineAlbumTimeout = setTimeout(function() {
    //   $("img.lazy").lazyload({
    //     threshold : 400
    //   });
    // }, 200);
    if (-10 < contentTop < 0) {
      isLoadMore = false;
    }
    if (contentTop < -50 && hour && !isLoadMore) {
      isLoadMore = true;
      var limit = Session.get('timelineAlbumGteLimit') + 10;
      console.log('loadMore and limit = '+limit+'hour = '+hour);
      Meteor.subscribe('device-timeline-with-hour',uuid,{$gte:hour},1,limit,function(){
        Session.set('timelineAlbumLoading',false);
        lazyTimelineImg();
      });
      Session.set('timelineAlbumGteLimit',limit);
    }
    else if((contentHeight + contentTop + 50 ) >= height){
      var limit = Session.get('timelineAlbumLimit') + 10;
      console.log('loadMore and limit = ',limit);
      // SimpleChat.withMessageHisEnable && SimpleChat.loadMoreMesage({to_type:'group',people_uuid:uuid,type:'text', images: {$exists: true}}, {limit: limit, sort: {create_time: -1}}, limit);
      if (hour) {
        Meteor.subscribe('device-timeline-with-hour',uuid,{$lte:hour},-1,limit,function(){
          Session.set('timelineAlbumLoading',false);
          lazyTimelineImg();
        });
      }
      else{
        Meteor.subscribe('device-timeline',uuid,limit);
      }
      lazyTimelineImg();
      Session.set('timelineAlbumLimit',limit);
    }
  });

  Meteor.subscribe('devices-by-uuid',Router.current().params._uuid);
  //Meteor.subscribe('get-workai-user-relation',Meteor.userId());  

  // timelineAlbumTimeout = setTimeout(function() {
  //     $("img.lazy").lazyload({
  //       threshold : 400
  //     });
  //     $('img.lazy').load(function() {
  //       console.log($(this).attr('src') + ' loaded');
  //       $(this).addClass('img-loaded').removeClass('lazy');
  //     });
  // }, 1000);
  window.timelineImgLazyInterval = window.setInterval(lazyTimelineImg,500);
});
Template.timelineAlbum.onDestroyed(function(){
  Session.set('wantModify',false);
  Session.set('wantModifyTime',null);
  Session.set('modifyMyStatus_ta_name',null);

  // clear Inetrval
  window.clearInterval(timelineImgLazyInterval);
});
Template.timelineAlbum.helpers({
  // lists: function(){
  //   var uuid = Router.current().params._uuid;
  //   var msgs = [];
  //   var tempDate = null;
  //   if(SimpleChat.Messages.find({to_type:'group',people_uuid:uuid,type:'text', images: {$exists: true}},{sort:{create_time:1}}).count() ==0){
  //      SimpleChat.withMessageHisEnable && SimpleChat.loadMoreMesage({to_type:'group',people_uuid:uuid,type:'text', images: {$exists: true}}, {limit: 10, sort: {create_time: -1}}, 10);
  //   }
  //   SimpleChat.Messages.find({to_type:'group',people_uuid:uuid,type:'text', images: {$exists: true}},{sort:{create_time:-1}}).forEach(function(item){
  //     var date = new Date(item.create_time);
  //     var time = date.shortTime();
  //     var obj = {
  //       create_time: time,
  //       ts: item.create_time,
  //       images: item.images
  //     };
  //     if(tempDate !== time){
  //       obj.isShowTime = true;
  //     }
  //     msgs.push(obj);
  //     tempDate = time;
  //   });
  //   return msgs;
  // },
  isLoading:function(){
    if (Session.get('timelineAlbumLoading') === false) {
      return false;
    }
    return true;
  },
  uuid: function() {
    var uuid = Router.current().params._uuid;
    var device = Devices.findOne({uuid: uuid});
    return device.name;
  }, 
  lists: function(){
    var uuid = Router.current().params._uuid;
    var lists = [];
    var personIds = [];
    var hour = Session.get('wantModifyTime');
    if (hour) {
      DeviceTimeLine.find({uuid: uuid,hour:{$lte:hour}},{sort:{hour:-1},limit:Session.get('timelineAlbumLimit')}).forEach(function(item){
        var tmpArr = [];
        for(x in item.perMin){
          var hour = new Date(item.hour)
          hour = hour.setMinutes(x);
          var tmpObj = {
            time: hour,
            images: []
          }
          item.perMin[x].forEach(function(img){
            if(personIds.indexOf(img.person_id) < 0 || img.person_name){
              personIds.push(img.person_id)
              tmpObj.images.push(img);
            }
          });
          tmpArr.push(tmpObj);
        }
        tmpArr.reverse();
        lists = lists.concat(tmpArr);
      });
      if (Session.get('timelineAlbumGteLimit') > 0) {
        DeviceTimeLine.find({uuid: uuid,hour:{$gte:hour}},{sort:{hour:1},limit:Session.get('timelineAlbumGteLimit')}).forEach(function(item){
          var tmpArr = [];
          for(x in item.perMin){
            var hour = new Date(item.hour)
            hour = hour.setMinutes(x);
            var tmpObj = {
              time: hour,
              images: []
            }
            item.perMin[x].forEach(function(img){
              if(personIds.indexOf(img.person_id) < 0  || img.person_name){
                personIds.push(img.person_id)
                tmpObj.images.push(img);
              }
            });
            tmpArr.push(tmpObj);
          }
          tmpArr.reverse();
          lists = tmpArr.concat(lists);
        });
      }
    }
    else{
      DeviceTimeLine.find({uuid: uuid},{sort:{hour:-1},limit:Session.get('timelineAlbumLimit')}).forEach(function(item){
        var tmpArr = [];
        for(x in item.perMin){
          var hour = new Date(item.hour)
          hour = hour.setMinutes(x);
          var tmpObj = {
            time: hour,
            images: []
          }
          item.perMin[x].forEach(function(img){
            if(personIds.indexOf(img.person_id) < 0 || img.person_name){
              personIds.push(img.person_id)
              tmpObj.images.push(img);
            }
          });
          tmpArr.push(tmpObj);
        }
        tmpArr.reverse();
        lists = lists.concat(tmpArr);
      });
    }
    personIds = [];
    return lists;
  },
  formatDate: function(time){
    var date = new Date(time);
    var device = Devices.findOne({uuid: Router.current().params._uuid});
    var group_id = device.groupId;
    var time_offset = 8;
    var group = SimpleChat.Groups.findOne({_id: group_id});
    console.log(group);
    if (group && group.offsetTimeZone) {
      time_offset = group.offsetTimeZone;
    }
    return date.shortTime(time_offset)
  },
  isMultiSelect: function(){
    return Session.equals('timelineAlbumMultiSelect',true);
  }

});

Template.timelineAlbum.events({
  'click .back': function(){
    return PUB.back();
  },
  'click .images-click-able, click .select-video-enable': function(e){
    e.stopImmediatePropagation();

    // is_video
    var is_video = false;
    console.log($(e.currentTarget).data('isvideo'))
    if($(e.currentTarget).data('isvideo')){
      is_video = true;
    }
    var uuid = Router.current().params._uuid;
    device = Devices.findOne({uuid: uuid});
    var people_id = e.currentTarget.id,
        group_id  = device.groupId;
    var taName = Session.get('modifyMyStatus_ta_name');
    var person_name = $(e.currentTarget).data('name') || taName ||'';
    var time_offset = 8;
    var group = SimpleChat.Groups.findOne({_id: group_id});
    console.log(group);
    if (group && group.offsetTimeZone) {
      time_offset = group.offsetTimeZone;
    }

    var confirm_text = '';
    var person_info = {
      'name': person_name,
      'uuid': uuid,
      'group_id': group_id,
      'img_url': $(e.currentTarget).data('imgurl'),
      'type': 'face',
      'ts': $(e.currentTarget).data('ts'),
      'accuracy': 1,
      'fuzziness': 1
    };

    // 是video 的处理
    if(is_video){
      person_info.type = 'video';
      person_info.video_src = $(e.currentTarget).data('videosrc');
    }

    var data = {
      user_id:Meteor.userId(),
      face_id:people_id,
      person_info: person_info
    };

    var msgText = '「' + device.name + '」提醒你： 有人帮你签到了';

    if(device.in_out && device.in_out == 'in'){
      data.checkin_time =  new Date( $(e.currentTarget).data('ts')).getTime()
      data.checkin_image = $(e.currentTarget).data('imgurl');
    } else {
      data.checkout_time =  new Date( $(e.currentTarget).data('ts')).getTime()
      data.checkout_image = $(e.currentTarget).data('imgurl');
    }
    data.wantModify = Session.get('wantModify');

    // 帮别人签到
    var taId = Router.current().params.query.taId;
    var msgObj;
    if(taId){
      data.user_id = taId;

      // var user = Meteor.user();
      var deviceUser = Meteor.users.findOne({username: uuid});
      var taUser = Meteor.users.findOne({_id: taId});
      msgObj = {
        _id: new Mongo.ObjectID()._str,
        form:{
          id: deviceUser._id,
          name: deviceUser.profile.fullname,
          icon: deviceUser.profile.icon
        },
        to: {
          id:   taUser._id,
          name: taUser.profile.fullname? taUser.profile.fullname: taUser.username,
          icon: taUser.profile.icon
        },
        to_type: 'user',
        type: 'text',
        text: msgText,
        images:[
          {
            id: people_id,
            url: $(e.currentTarget).data('imgurl'),
            label: person_name,
            img_type: is_video ? 'video' : 'face',
            video_src:person_info.video_src
          }
        ],
        people_uuid: uuid,
        checkin_time:data.checkin_time,
        checkout_time:data.checkout_time,
        is_agent_check:true, //是否是代签消息
        offsetTimeZone:time_offset,
        create_time: new Date(),
        is_read: false,
      };
    }
    else if (taName) { //帮标识过但没关联的人代签
      data.user_id = null;
    }
    console.log(data);
    // 检查是否标识过自己
    var relations = WorkAIUserRelations.findOne({'app_user_id':data.user_id,group_id:group_id});
    var formPage = Router.current().params.query.from;
    var callbackRsu = function(res){

    };
    if(relations || taName ){ // 标识过
      confirm_text = '是否将该时间记录到每日出勤报告？';
      person_name = relations ? relations.person_name : taName;
      if(person_name){
        confirm_text = '是否将该时间记录到「'+ person_name +'」每日出勤报告？'
      }
      PUB.confirm(confirm_text,function(){
        Meteor.call('ai-checkin-out',data,function(err, res){
          if(err){
            PUB.toast('记录失败，请重试');
            console.log('ai-checkin-out error:' + err);
            return;
          }
          // if(timelineAlbumTimeout){
          //   window.clearTimeout(timelineAlbumTimeout);
          // }
          // timelineAlbumTimeout = setTimeout(function() {
          //   $("img.lazy").lazyload({});
          // }, 500);
          if(res && res.result == 'succ'){
            PUB.toast('已记录到每日出勤报告');
            // 发送代Ta 签到成功通知
            if(taId){
              console.log(msgObj)
              sendMqttUserMessage(taId,msgObj);
            }
            if (formPage && formPage === 'agentMsg') {
              var msgId = Router.current().params.query.msgId;
              var reCheckTime = data.checkin_time || data.checkout_time;
              SimpleChat.Messages.update({_id:msgId},{$set:{hadReCheck:true,is_right:false,reCheckTime:reCheckTime,offsetTimeZone:time_offset}});
              return Router.go('/simple-chat/to/user?id='+deviceUser._id);
            }
            return PUB.back();
          } else {
            return navigator.notification.confirm(res.text,function(index){

            },res.reason,['知道了']);
          }
        });
      });
    } else {
      var tips = is_video ? '视频' : '照片';
      confirm_text = '是否选择此' + tips +'？';
      if(person_name){
        confirm_text = '此' + tips +'是：「'+person_name+'」，是否选择？';
      }
      else{
        data.msgText = msgText;
        Session.set('setPicturePersonNameData',data);
        $('#picturePersonName').val("");
        Meteor.setTimeout(function(){
          $('#picturePersonName').focus();
        },800);
        return $('#setPicturePersonName').modal('show');
        // confirm_text = '请选择一张有名字的照片或前往聊天室进行标记~';
        // var url = '/simple-chat/to/group?id='+ group_id;
        // try{
        //   navigator.notification.confirm(confirm_text,function
        //         (index){if (index === 2) {PUB.page(url);}},
        //         '提示',['重选','转入聊天室']);
        // }
        // catch (error){
        //   if(confirm(confirm_text)){
        //     PUB.page(url);
        //   }
        // }
      }
      PUB.confirm(confirm_text,function(){
        Meteor.call('ai-checkin-out',data,function(err,res){
          if(err){
            PUB.toast('请重试');
            console.log('ai-checkin-out error:' + err);
            return;
          }
          // if(timelineAlbumTimeout){
          //   window.clearTimeout(timelineAlbumTimeout);
          // }
          // timelineAlbumTimeout = setTimeout(function() {
          //   $("img.lazy").lazyload({});
          // }, 500);
          if(res && res.result == 'succ'){
            PUB.toast('已记录到每日出勤报告');
            // 发送代Ta 签到成功通知
            if(taId){
              console.log(msgObj)
              sendMqttUserMessage(taId,msgObj);
            }
            return PUB.back();
          } else {
            return navigator.notification.confirm(res.text,function(index){

            },res.reason,['知道了']);
          }
        });
      });
    }
  },
  'click .confirmPersonName': function(e){
    var name = $('#picturePersonName').val();
    if(!name || name.length < 1){
      PUB.toast('请输入姓名');
      return $('#picturePersonName').focus();
    }
    var data = Session.get('setPicturePersonNameData');
    data.person_info.name = name;
    var taId = Router.current().params.query.taId;
    var msgObj;
    if(taId){
      data.user_id = taId;

      // var user = Meteor.user();
      var deviceUser = Meteor.users.findOne({username: Router.current().params._uuid});
      var taUser = Meteor.users.findOne({_id: taId});
      // var device = Devices.findOne({uuid: Router.current().params._uuid});
      msgObj = {
        _id: new Mongo.ObjectID()._str,
        form: {
          id: deviceUser._id,
          name: deviceUser.profile.fullname,
          icon: deviceUser.profile.icon
        },
        to: {
          id:   taUser._id,
          name: taUser.profile.fullname? taUser.profile.fullname: taUser.username,
          icon: taUser.profile.icon
        },
        to_type: 'user',
        type: 'text',
        text: data.msgText,
        create_time: new Date(),
        is_read: false
      };
    }
    console.log(data);
    Meteor.call('ai-checkin-out',data,function(err,res){
      $('#setPicturePersonName').modal('hide');
      $('body').removeClass('modal-open');
      $('.modal-backdrop').remove();
      if(err){
        PUB.toast('请重试');
        console.log('ai-checkin-out error:' + err);
        return;
      }
      // if(timelineAlbumTimeout){
      //   window.clearTimeout(timelineAlbumTimeout);
      // }
      // timelineAlbumTimeout = setTimeout(function() {
      //   $("img.lazy").lazyload({});
      // }, 500);
      if(res && res.result == 'succ'){
        PUB.toast('已记录到每日出勤报告');
        // 发送代Ta 签到成功通知
        if(taId){
          console.log(msgObj)
          sendMqttUserMessage(taId,msgObj);
        }
        return PUB.back();
      } else {
        return navigator.notification.confirm(res.text,function(index){

        },res.reason,['知道了']);
      }
    });
  },
  // 显示视频预览层
  'click .videos':function(e){
    var video_src = $(e.currentTarget).data('videosrc');
    var video_post = $(e.currentTarget).data('videopost');
    $('.videoLayer').append('<video id="timeline-video-preview" class="video-js vjs-default-skin" preload="auto" width="100%" height="100%" poster="{{video_post}}" webkit-playsinline="true" playsinline="true" loop>\
      <source src="" type="video/mp4" />\
      <p class="vjs-no-js">Not supports HTML5 video</p>\
    </video>');
    $('.videoPreviewLayer').fadeIn(function(){
      videojs("timeline-video-preview", {}, function() {
        window.VideoPlayer = this;
        $("#timeline-video-preview source").attr("src", video_src);
        VideoPlayer.src(video_src);
        VideoPlayer.load(video_src);
        VideoPlayer.play();
      });
    });
  },
  'click .videoPreviewLayer': function(e){
    VideoPlayer.pause();
    // VideoPlayer = null;
    videojs("timeline-video-preview").dispose();
    $('.videoPreviewLayer').fadeOut();
  }
});