const Datastore = require('nedb');
const path = require('path');
const Evt = require('./evt');
const dbClient = require('./db_client');

// 数据库初始化
// var dbPath = require('nw.gui').App.dataPath + '/nedb';
// var dbPath = Evt.getBasePath() + '/Users/life/Library/Application Support/Leanote' + '/nedb';
// nedb2 为了port
let dbPath = Evt.getDBPath();
// console.error(dbPath);

// test
if(dbPath.length < 6) {
    dbPath = '/Users/life/Library/Application Support/Leanote' + '/nedb2';
}

// console.log(dbPath);
// g, 表全局环境
const db = {

    // 为全部用户共有的表初始化
    initGlobal: function () {
        const me = this;
        const dbNames = ['users', 'g'];
        this.initIt(me, dbNames);
    },

    // 为特定用户初始化自己的表
    initDBForUser: function (userId, curUser) {
        const me = this;
        const dbNames = ['notebooks', 'notes', 'tags', /*'images',*/ 'attachs', 'noteHistories'];
        this.initIt(me, dbNames, userId);

        // init dbClient -> main db
        let baseDBPath = dbPath;
        if (userId) {
            baseDBPath += '/' + userId;
        }
        dbClient.init(curUser, baseDBPath);
    },

    // 过时
    init: function () {
        const me = this;
        const dbNames = ['users', 'notebooks', 'notes', 'tags', /*'images',*/ 'attachs', 'noteHistories', 'g'];
        this.initIt(me, dbNames);
    },

    // 过时
    initForLogin: function () {
        const me = this;
        // var dbNames = ['users'];
        const dbNames = ['users', 'notebooks', 'notes', 'tags', 'noteHistories'];
        this.initIt(me, dbNames);
    },

    // map, 最后的db设到map里
    // forceAutoload 是否强制加载
    initIt: function (map, dbNames, userId, forceAutoload) {
        const me = this;
        for (let i in dbNames) {
            const name = dbNames[i];

            if (!userId) {
                userId = '';
            }
            let baseDBPath = dbPath;
            if (userId) {
                baseDBPath += '/' + userId;
            }

            const dbFilepath = path.join(baseDBPath, name + '.db');
            // console.log(dbFilepath);
            (function (name) {
                // 这部分非常慢!, 会卡界面
                const autoload = forceAutoload || name !== 'noteHistories';
                map[name] = new Datastore({
                    filename: dbFilepath, autoload: autoload, onload: function () {
                        console.log(userId + '/' + name + ' is loaded');
                    }
                });
            })(name);
        }
        console.log('db inited');
    }
};

// 加载DB, 为noteHistories
Datastore.prototype.loadDB = function(callback) {
    const me = this;
    if (this.__loaded) {
        callback(me.__loadedSuccess);
    } else {
        this.loadDatabase(function (err) {
            me.__loaded = true;
            console.log(err);
            me.__loadedSuccess = !err;
            callback(me.__loadedSuccess);
        });
    }
};


module.exports = db; 
