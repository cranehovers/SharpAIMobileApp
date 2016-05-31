RocketChat.sendMessage = (user, message, room, options) ->
	if not user or not message or not room._id
		return false

	unless message.ts?
		message.ts = new Date()

	message.u = _.pick user, ['_id','username', 'name']
	message.u.name = Meteor.users.findOne({_id: user._id}).name

	message.rid = room._id

	console.log user
	if not room.usernames?
		room = RocketChat.models.Rooms.findOneById(room._id)

	if message.parseUrls isnt false
		if urls = message.msg.match /([A-Za-z]{3,9}):\/\/([-;:&=\+\$,\w]+@{1})?([-A-Za-z0-9\.]+)+:?(\d+)?((\/[-\+=!:~%\/\.@\,\w]*)?\??([-\+=&!:;%@\/\.\,\w]+)?(?:#([^\s\)]+))?)?/g
			message.urls = urls.map (url) -> url: url

	message = RocketChat.callbacks.run 'beforeSaveMessage', message

	if message._id? and options?.upsert is true
		RocketChat.models.Messages.upsert {_id: message._id}, message
	else
		message._id = RocketChat.models.Messages.insert message

	###
	Defer other updates as their return is not interesting to the user
	###
	Meteor.defer ->
		# Execute all callbacks
		RocketChat.callbacks.run 'afterSaveMessage', message, room

	return message