// 只有api的插件才能访问
const Api = {
    notebook: Notebook,
    note: Note,
    tag: Tag,
    loading: Loading,
    gui: gui,
    onClose: onClose,
    switchToLoginWhenNoUser: switchToLoginWhenNoUser,
    reloadApp: reloadApp,
    isMac: isMac(),
    NodeFs,
    NodePath,
    evtService: EvtService,
    commonService: CommonService,
    fileService: FileService,
    noteService: NoteService,
    userService: UserService,
    dbService: db,
    ipc: electron.ipcRenderer,
    projectPath: projectPath,
    Resanitize,

    // 打开本地目录
    // mac和windows下不同
    openLocalDir: function (dir) {
        if (isMac()) {
            gui.Shell.showItemInFolder(dir);
        } else {
            gui.Shell.openItem(dir);
        }
    },

    // 得到当前版本
    getCurVersion: function (callback) {
        const me = this;
        const vFile = me.evtService.getProjectBasePath() + '/data/version';
        // fs.writeFileSync('./output.json',JSON.stringify({a:1,b:2}));
        try {
            const v = JSON.parse(fs.readFileSync(vFile));
            return v;
        } catch (e) {
            return false;
        }
    },

    getConfigFilePath: function () {
        const me = this;
        return me.evtService.getProjectBasePath() + '/public/config.js';
    },
    writeConfig: function (config) {
        const me = this;
        const fileData = "var Config = " + JSON.stringify(config, null, 4) + ';';
        const ok = me.commonService.writeFile(me.getConfigFilePath(), fileData);
        return ok;
    },

    // data = {'en-us': {}, 'zh-cn' {}};
    // prefix = 'plugin.theme'
    _langs: {
        'en-us': {
            'default': 'Default',
        },
        'zh-cn': {
            'default': '默认',
        }
    },
    curLang: curLang,
    defaultLang: 'en-us',
    // 添加语言包
    addLangMsgs: function (data, prefix) {
        const me = this;
        if (!data) {
            return;
        }
        if (prefix) {
            prefix += '.'; // prefix.
        }
        for (let lang in data) {
            const msgs = data[lang] || {};
            me._langs[lang] || (me._langs[lang] = {});
            for (let key in msgs) {
                me._langs[lang][prefix + key] = msgs[key];
            }
        }
    },
    isArray: function (obj) {
        return Object.prototype.toString.call(obj) === '[object Array]';
    },
    // 国际化
    getMsg: function (key, prefix, data) {
        const me = this;
        if (!key) {
            return '';
        }
        const rawKey = key;
        if (prefix) {
            key = prefix + '.' + key;
        }

        let msg = me._langs[me.curLang][key] || me._langs[me.defaultLang][key] || rawKey;

        if (data) {
            if (!me.isArray(data)) {
                data = [data];
            }
            for (let i = 0; i < data.length; ++i) {
                msg = msg.replace("%s", data[i]);
            }
        }
        return msg;
    },

    // 与之前lang.js取出的数据合并
    _init: function () {
        const me = this;
        me._langs[me.curLang] || (me._langs[me.curLang] = {});
        $.extend(me._langs[me.curLang], window.langData);

        // extend
        window.getMsg = function (key, prefix, data) {
            return me.getMsg(key, prefix, data);
        };
    },

    _callOpenAfter: function () {

    },

    _themeMenu: null,
    getThemeMenu: function () {
        const me = this;
        return me._themeMenu;
    },
    setThemeMenu: function (menus) {
        const me = this;
        me._themeMenu = menus;
    },

    // markdown theme
    _mdThemeMenu: null,
    getMdThemeMenu: function () {
        const me = this;
        return me._mdThemeMenu;
    },
    setMdThemeMenu: function (menus) {
        const me = this;
        me._mdThemeMenu = menus;
    },

    _importMenus: [],
    addImportMenu: function (menu) {
        const me = this;
        me._importMenus.push(menu);
    },
    getImportMenus: function () {
        const me = this;
        return me._importMenus;
    },
    // 添加用户menu
    addUserMenu: function (menus, pos) {


    },
    addNotebookMenu: function (menu, pos) {

    },
    addTrashMenu: function (menu, pos) {

    },

    // 导出
    _exportMenus: [],
    addExportMenu: function (menu) {
        const me = this;
        me._exportMenus.push(menu);
    },
    getExportMenus: function () {
        const me = this;
        return me._exportMenus;
    },

    // 导出, 笔记本下
    _exportMenusForNotebook: [],
    addExportMenuForNotebook: function (menu) {
        const me = this;
        me._exportMenusForNotebook.push(menu);
    },
    getExportMenusForNotebook: function () {
        const me = this;
        return me._exportMenusForNotebook;
    },

    // 更多菜单
    _moreMenus: [],
    getMoreMenus: function () {
        const me = this;
        return me._moreMenus;
    },
    addMoreMenu: function (menu) {
        const me = this;
        me._moreMenus.push(menu);
    },

    _lastPath: null,
    getDefaultPath() {
        return this._lastPath || this.gui.app.getPath('userDesktop')
    },
    saveLastPath(dir, filePath) {
        this._lastPath = dir || this.NodePath.dirname(filePath)
    }
};

//-------------
// 全局事件机制

$.extend(Api, {
    _eventCallbacks: {},
    _listen: function(type, callback) {
        const callbacks = this._eventCallbacks[type] || (this._eventCallbacks[type] = []);
        callbacks.push(callback);
    },
    // on('a b', function(params) {})
    on: function(name, callback) {
        const names = name.split(/\s+/);
        for (let i = 0; i < names.length; ++i) {
            this._listen(names[i], callback);
        }
        return this;
    },
    // off('a b', function(params) {})
    off: function(name, callback) {
        const types = name.split(/\s+/);
        let i, j, callbacks, removeIndex;
        for (i = 0; i < types.length; i++) {
            callbacks = this._eventCallbacks[types[i].toLowerCase()];
            if (callbacks) {
                removeIndex = null;
                for (j = 0; j < callbacks.length; j++) {
                    if (callbacks[j] === callback) {
                        removeIndex = j;
                    }
                }
                if (removeIndex !== null) {
                    callbacks.splice(removeIndex, 1);
                }
            }
        }
    },
    // LEA.trigger('a', {});
    trigger: function(type, params) {
        const callbacks = this._eventCallbacks[type] || [];
        if (callbacks.length === 0) {
            return;
        }
        for (let i = 0; i < callbacks.length; i++) {
            callbacks[i].call(this, params);
        }
    }
});


Api._init();