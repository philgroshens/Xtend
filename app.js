var express = require('express'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    methodOverride = require('method-override'),
    session = require('express-session'),
    MongoStore = require('connect-mongo')(session),
    logger = require('express-logger'),
    mongoose = require('mongoose'),
    fs = require('fs'),
    passport = require('passport'),
    config = require('./config/config.js'),
    User = require('./models/User'),
    Blog = require('./models/Blog'),
    Post = require('./models/Post'),
    Queue = require('./models/Queue'),
    TokenSet = require('./models/TokenSet'),
    Notification = require('./models/Notification');

mongoose.connect(config.db.uri, function(err){
    if(err){
        console.log('Is mongodb running?');
        process.exit();
    }
});

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.static(__dirname + '/public'));
app.use(logger({path: './log.txt'}));
app.use(cookieParser());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
app.use(methodOverride());
app.use(session({
    secret: config.db.session.secret,
    name: 'session',
    store: new MongoStore({mongooseConnection: mongoose.connection}),
    proxy: true,
    resave: true,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

app.use(function(req, res, next){
    res.locals.user = req.user;
    next();
});

require('./config/passport.js')(app, passport);

app.use('/api/', require('./routes/api'));
app.use('/', require('./routes/chromeExtension'));
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/web'));
app.use('/', require('./routes/blog'));

// Handle 404
app.use(function(req, res) {
    res.status(400);
    res.render('http/404', {
        title: '404: File Not Found'}
    );
});

// Handle 500
app.use(function(error, req, res, next) {
    res.status(500);
    res.render('http/500', {
        title:'500: Internal Server Error',
        error: error
    });
});

if(config.emptyLog){
    fs.writeFile('./log.txt', '', function(){
        console.log('Log file emptied.');
    });
}

app.listen(config.env.port, function() {
    console.log('Xtend is running on port %s', config.env.port);
});
