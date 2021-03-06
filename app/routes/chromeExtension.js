var express  = require('express'),
    async = require('async'),
    User  = require('../models/User.js'),
    Blog  = require('../models/Blog.js'),
    Notification  = require('../models/Notification.js'),
    PostSet  = require('../models/PostSet.js'),
    Post  = require('../models/Post.js');

module.exports = (function() {
    var app = express.Router();

    app.post('/api/posts', function(req, res){
        var blogUrl = req.body.blogUrl,
            posts = req.body.posts,
            apiKey = req.body.apiKey,
            queuedFrom = req.body.queuedFrom;

        function doesUserHaveBlog (user, blogUrl){
            for (var i = 0; i < user.tokenSet.length;i++){
                for (var j = 0; j < user.tokenSet[i].blogs.length;j++){
                    if(user.tokenSet[i].blogs[j].url.toLowerCase() === blogUrl.toLowerCase()) { return true; }
                }
            }
        }

        User.findOne({ apiKey: apiKey }).populate('tokenSet').populate('plan').exec(function(err, user, next){
            if(err) { res.send({error: err}); }
            if(user){
                async.each(user.tokenSet, function (tokenSet, callback) {
                    tokenSet.populate({path:'blogs'}, function (err, result) {
                        if(err) { callback(err); }
                        if(result){
                            async.each(tokenSet.blogs, function (blog, callback) {
                                blog.populate({path: 'notifications'}, function(err, result){
                                    if(err) { callback(err); }
                                    if(result){
                                        callback();
                                    }
                                });
                            }, function (err) {
                                if(err) { callback(err); }
                                callback();
                            });
                        }
                    });
                }, function (err) {
                    if(err) { next(err); }
                    if(doesUserHaveBlog(user, blogUrl)){
                        Blog.findOne({url: blogUrl}, function(err, blog){
                            if(err) { console.log(err); }
                            if(blog){
                                if(blog.postsInQueue >= user.plan.maxPosts || blog.postsInQueue + posts.length >= user.plan.maxPosts){
                                    res.send({
                                        error: 'You can only have ' + user.plan.maxPosts + ' posts in your queue, you currently have ' + blog.postsInQueue
                                    });
                                } else {
                                    var newPosts = [];
                                    for (var id in posts) {
                                        if (posts.hasOwnProperty(id)) {
                                            var post = new Post({
                                                blogId: blog.id,
                                                postId: id,
                                                reblogKey: posts[id].reblogKey
                                            });
                                            post.save();
                                            newPosts.push(post.toObject());
                                        }
                                    }
                                    var notification = new Notification({
                                        blogUrl: queuedFrom,
                                        content: blog.url + ' queued ' + newPosts.length + ' from ' + queuedFrom,
                                        read: false
                                    });
                                    notification.save(function(err, notification){
                                        Blog.findOne({url: queuedFrom}, function(err, queuedFromBlog){
                                            if(err) { console.log(err); }
                                            if(queuedFromBlog) {
                                                queuedFromBlog.notifications.push(notification.id);
                                            }
                                            blog.postsInQueue = blog.postsInQueue+newPosts.length;
                                            blog.notifications.push(notification.id);
                                            blog.save();
                                            var postSet = new PostSet({
                                                posts: newPosts,
                                                blogId: blog.id,
                                                clearCaption: false,
                                                postCount: {
                                                    start: newPosts.length,
                                                    now: newPosts.length
                                                }
                                            });
                                            postSet.save(function(err, postSet){
                                                res.send({
                                                    ok: 'okay',
                                                    postSet: postSet
                                                });
                                            });
                                        });
                                    });
                                }
                            } else {
                                res.send({
                                    error: 'We misplaced your blogs?'
                                });
                            }
                        });
                    } else {
                        res.send({
                            error: 'That blog isn\'t listed on your account'
                        });
                    }
                });
            } else {
                res.send({
                    error: 'Api key is invalid'
                });
            }
        });
    });

    app.get('/api/blogs', function(req, res, next){
        var apiKey = req.query.apiKey;
        User.findOne({ apiKey: apiKey }).populate('tokenSet').populate('plan').exec(function(err, user){
            if(err) { res.send({error: err}); }
            if(user){
                async.each(user.tokenSet, function (tokenSet, callback) {
                    tokenSet.populate({path:'blogs'}, function (err, result) {
                        if(result){
                            async.each(tokenSet.blogs, function (blog, callback) {
                                blog.populate({path: 'notifications'}, function(err, result){
                                    if(err) { callback(err); }
                                    if(result){
                                        callback();
                                    }
                                });
                            }, function (err) {
                                if(err) { callback(err); }
                                callback();
                            });
                        }
                    });
                }, function (err) {
                    if(err) { next(err); }
                    var blogs = [];
                    if(user.tokenSet.length){
                        for(var i = 0; i < user.tokenSet.length; i++){
                            for(var k = 0; k < user.tokenSet[i].blogs.length; k++){
                                var blog = user.tokenSet[i].blogs[k];
                                blogs.push({
                                    url: blog.url,
                                    postCount: blog.postCount,
                                    followerCount: blog.followerCount
                                });
                            }
                        }
                        res.send({
                            ok: 'okay',
                            blogs: blogs
                        });
                    } else {
                        res.send({
                            error: 'No blogs found',
                            blogs: blogs
                        });
                    }
                });
            } else {
                res.send({
                    error: 'Api key is invalid'
                });
            }
        });
    });

    return app;
 })();
