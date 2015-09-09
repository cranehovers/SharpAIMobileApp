
subs = new SubsManager({
# maximum number of cache subscriptions
  cacheLimit: 300,
# any subscription will be expire after minutes, if it's not subscribed again
  expireIn: 60*24
})

if Meteor.isClient
  Router.route '/redirect/:_id',()->
    Session.set('nextPostID',this.params._id)
    this.render 'redirect'
    return
  Router.route '/posts/:_id', {
      waitOn: ->
        subs.subscribe("publicPosts",this.params._id)
      loadingTemplate: 'loadingPost'
      action: ->
        post = Posts.findOne({_id: this.params._id})
        unless post
          console.log "Cant find the request post"
          this.render 'postNotFound'
          return
        Session.set("refComment",[''])
        Meteor.subscribe "refcomments",()->
          Meteor.setTimeout ()->
            refComment = RefComments.find()
            if refComment.count() > 0
              Session.set("refComment",refComment.fetch())
          ,2000
        Session.set('postContent',post)
        if post.addontitle and (post.addontitle isnt '')
          documentTitle = "『故事贴』" + post.title + "：" + post.addontitle
        else
          documentTitle = "『故事贴』" + post.title
        Session.set("DocumentTitle",documentTitle)
        favicon = document.createElement('link')
        favicon.id = 'icon'
        favicon.rel = 'icon'
        favicon.href = post.mainImage
        document.head.appendChild(favicon)

        this.render 'showPosts', {data: post}
        Session.set 'channel','posts/'+this.params._id
      fastRender: true
    }
  Router.route '/',()->
    this.render 'webHome'
    return
  Router.route '/help',()->
    this.render 'help'
    return
  Router.route 'userProfilePage1',
    template: 'userProfile'
    path: '/userProfilePage1'
  Router.route 'userProfilePage2',
    template: 'userProfile'
    path: '/userProfilePage2'
  Router.route 'userProfilePage3',
    template: 'userProfile'
    path: '/userProfilePage3'
if Meteor.isServer
  Router.route '/posts/:_id', {
      waitOn: ->
        subs.subscribe("publicPosts",this.params._id)
      fastRender: true
    }
