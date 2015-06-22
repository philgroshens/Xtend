var mongoose = require('mongoose'),
    tumblr = require('tumblr.js'),
    Queue = require('../models/Queue'),
    Post = require('../models/Post'),
    Blog = require('../models/Blog'),
    config = require('../config.js');

mongoose.connect('mongodb://localhost/xtend');

setInterval(function(){
    Queue.find(function(err, queues) {
        if (err) console.log(err);
        queues.forEach(function(queue){
            var now = new Date();
            var timeNow = now.getTime();
            var hourNow = now.getHours();
            if ((hourNow >= queue.startHour) && (hourNow <= queue.endHour)) {
                var lastRun = queue.lastRun.getTime();
                var nextRun = lastRun + ((((queue.endHour - queue.startHour) * 60 * 60) / queue.interval) * 1000);
                if (nextRun <= timeNow) {
                    if (queue.backfill) {
                        queue.lastRun = nextRun;
                    } else {
                        queue.lastRun = timeNow;
                    }
                    queue.save();
                    Post.findOne({blogId: queue.blogId}, function(err, post){
                        if (err) console.log(err);
                        if (post){
                            TokenSet.findOne({blogs: queue.blogId}, function(err, tokenSet){
                                if (err) console.log(err);
                                if (tokenSet && tokenSet.enabled) {
                                    if (tokenSet.token == '' || tokenSet.tokenSecret == '' ) {
                                        tokenSet.enabled = false;
                                        tokenSet.errorMessage = 'Please reauthenticate with Tumblr.';
                                        tokenSet.save();
                                    } else {
                                        var client = tumblr.createClient({
                                            consumer_key: config.tumblr.token,
                                            consumer_secret: config.tumblr.tokenSecret,
                                            token: tokenSet.token,
                                            token_secret: tokenSet.tokenSecret
                                        });
                                        var caption = post.clearCaption ? '' : post.caption;
                                        Blog.findOne({_id: queue.blogId}, function(err, blog){
                                            if(err) console.log(err);
                                            client.reblog(blog.url, {id: post.postId, reblog_key: post.reblogKey, caption: caption}, function(err, reblog){
                                                if (err) {
                                                    console.log(err);
                                                    tokenSet.enabled = false;
                                                    tokenSet.errorMessage = err;
                                                    tokenSet.save();
                                                } else {
                                                    console.log((new Date()) + ' ' + blog.url + ' reblogged');
                                                    if (post.clearCaption) {
                                                        client.edit(blog.url, { id: reblog.id, caption: post.caption }, function (err, edit) {
                                                            if (err) console.log(err);
                                                            console.log((new Date()) + ' ' + blog.url + ' changed caption');
                                                        });
                                                    }
                                                    blog.postsInQueue--;
                                                    blog.save();
                                                    post.remove();
                                                }
                                            });
                                        });
                                    }
                                }
                            });
                        }
                    });
                }
            }
        });
    });
}, 1000);
