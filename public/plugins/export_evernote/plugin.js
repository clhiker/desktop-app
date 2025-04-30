/**
 * 导出Evernote插件
 * @author  life life@leanote.com
 *
 * 注意/遗留问题:
 *
 * 1. 导出的文件有可能不能导入到evernote, 即使可以导入, 也有可能不能同步
 *    原因: enml.dtd
 * 2. 导出markdown问题, 加一个<pre>markdown content</pre>. 导出的markdown没有图片
 *
 * https://dev.evernote.com/doc/articles/enml.php

Before submitting HTML content over the EDAM API the client application is expected to follow the following steps:
1. Convert the document into valid XML
2. Discard all tags that are not accepted by the ENML DTD
3. Convert tags to the proper ENML equivalent (e.g. BODY becomes EN-NOTE)
4. Validate against the ENML DTD
5. Validate href and src values to be valid URLs and protocols

 */
define(function() {
    let async; //  = require('async');
    let enml; //  = nodeRequire('./public/plugins/export_evernote/enml');

    //==============
    // tpls

    const evernoteTpl = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export3.dtd">
<en-export export-date="{exportedTime}" application="leanote.desktop.app.{platform}" version="{appVersion}">
<note><title>{title}</title><content><![CDATA[<?xml version="1.0" encoding="UTF-8" standalone="no"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>{content}</en-note>
]]></content>
    <created>{createdTime}</created>
    <updated>{updatedTime}</updated>
    {tags}
    <note-attributes>
        <latitude></latitude>
        <longitude></longitude>
        <altitude></altitude>
        <leaIsMarkdown>{isMarkdown}</leaIsMarkdown>
        <author>{authorEmail}</author>
        <source>leanote.desktop</source>
        <reminder-order>0</reminder-order>
    </note-attributes>
    {resources}
</note>
</en-export>
    `;

    const resourceTpl = `<resource>
    <data encoding="base64">{base64}</data>
    <mime>{type}</mime>
    <width>{width}</width>
    <height>{height}</height>
    <duration>0</duration>
    <resource-attributes>
        <timestamp>{createdTime}</timestamp>
        <file-name>{name}</file-name>
    </resource-attributes>
</resource>`;

    //===========
    // start

    return {
        langs: {
            'en-us': {
                'export': 'Export Evernote',
                'Exporting': 'Exporting',
                'Exporting: ': 'Exporting: ',
                'exportSuccess': 'Evernote saved successful!',
                'exportFailure': 'Evernote saved failure!',
                'notExists': 'Please sync your note to ther server firslty.'
            },
            'de-de': {
                'export': 'Als Evernote exportieren',
                'Exporting': 'Exportiere',
                'Exporting: ': 'Exportiere: ',
                'exportSuccess': 'Evernote erfolgreich gespeichert!',
                'exportFailure': 'Evernote speichern fehlgeschlagen!',
                'notExists': 'Bitte Notizen zuerst mit dem Server synchronisieren.'
            },
            'zh-cn': {
                'export': '导出Evernote',
                'Exporting': '正在导出',
                'Exporting: ': '正在导出: ',
                'exportSuccess': 'Evernote导出成功!',
                'exportFailure': 'Evernote导出失败!'
            },
            'zh-hk': {
                'export': '導出Evernote',
                'Exporting': '正在導出',
                'Exporting: ': '正在導出: ',
                'exportSuccess': 'Evernote導出成功!',
                'exportFailure': 'Evernote導出失敗!'
            }
        },

        _inited: false,
        init: function () {
            const me = this;
            if (me._inited) {
                return;
            }
            async = require('async');
            enml = nodeRequire('./public/plugins/export_evernote/enml');

            me._inited = true;
        },

        replaceAll: function (src, pattern, to) {
            if (!src) {
                return src;
            }
            while (true) {
                const oldSrc = src;
                src = src.replace(pattern, to);
                if (oldSrc === src) {
                    return src;
                }
            }
        },

        fixFilename: function (filename) {
            const reg = new RegExp("[/#$!^*\' \"%&()+,:;<>=?@|\\\\]", 'g');
            filename = filename.replace(reg, "-");
            // 防止出现两个连续的-
            while (filename.indexOf('--') !== -1) {
                filename = this.replaceAll(filename, '--', '-');
            }
            if (filename.length > 1) {
                // 最后一个-
                filename = filename.replace(/-$/, '');
            }
            return filename;
        },

        getEvernoteTime: function (t) {
            // 20151026T033928Z
            // 2015 10 26 T 03 39 28 Z
            if (!t) {
                t = new Date();
            }
            if (typeof t != 'object' || !('getTime' in t)) {
                try {
                    t = new Date(t);
                } catch (e) {
                    t = new Date();
                }
            }
            return t.format("yyyyMMddThhmmssZ");
        },

        renderTpl: function (tpl, info, keys) {
            for (let i = 0; i < keys.length; ++i) {
                tpl = tpl.replace('{' + keys[i] + '}', info[keys[i]]);
            }
            return tpl;
        },

        render: function (note, callback) {
            const me = this;
            const keys = ['title', 'content', 'createdTime', 'updatedTime', 'tags',
                'isMarkdown', 'exportedTime', 'appVersion', 'authorEmail', 'platform', 'resources'
            ];
            const tpl = evernoteTpl;
            const appVersion = Api.getCurVersion() || {version: 'unknown'};
            const info = {
                title: note.Title,
                content: note.Content,
                createdTime: me.getEvernoteTime(note.createdTime),
                updatedTime: me.getEvernoteTime(note.updatedTime),
                exportedTime: me.getEvernoteTime(),
                authorEmail: Api.userService.email || Api.userService.username,
                platform: process.platform,
                appVersion: appVersion.version,
                isMarkdown: note.IsMarkdown ? 'true' : 'false',
                tags: me.renderTags(note.Tags)
            };

            me.fixResources(note.Content, function (content, resources) {
                content = $('<div>' + content + '</div>').html();
                content = content.replace(/<br.*?>/g, '<br />');
                content = content.replace(/<hr.*?>/g, '<hr />');
                info.resources = resources;

                enml.ENMLOfHTML(content, function (err, ENML) {
                    if (err) {
                        info.content = content;
                    } else {
                        info.content = ENML;
                    }

                    if (note.IsMarkdown) {
                        info.content = '<pre>' + info.content + '</pre>';
                    }

                    callback(me.renderTpl(tpl, info, keys));
                });
            });
        },

        renderTags: function (tags) {
            if (!tags || tags.length === 0) {
                return ''
            }
            let str = '';
            for (let i = 0; i < tags.length; ++i) {
                if (tags[i]) {
                    str += '<tag>' + tags[i] + '</tag>';
                }
            }
            return str;
        },

        // 得到resource
        renderResource: function (fileInfo) {
            const me = this;
            const keys = ['name', 'width', 'height', 'type', 'createdTime', 'base64'];
            const tpl = resourceTpl;
            fileInfo.width = '';
            fileInfo.height = '';
            fileInfo.createdTime = me.getEvernoteTime(fileInfo.createdTime);
            return me.renderTpl(tpl, fileInfo, keys);
        },

        findAllImages: function (content) {
            const reg = new RegExp('<img[^>]*?src=["\']?' + Api.evtService.getImageLocalUrlPrefix() + '\\?fileId=([0-9a-zA-Z]{24})["\']?.*?>', 'g');
            let matches = reg.exec(content);

            // width="330" height="330", style="width:200px"
            const widthReg = /width(=|:)[ "']*?([0-9]+)/;
            const heightReg = /height(=|:)[ "']*?([0-9]+)/;

            // 先找到所有的
            const allMatchs = [];
            while (matches) {
                const all = matches[0];

                const fileId = matches[1];

                // 得到width, height
                const widthRet = all.match(widthReg);
                const heightRet = all.match(heightReg);
                let width = '';
                let height = '';
                if (widthRet) {
                    width = widthRet[2];
                }
                if (heightRet) {
                    height = heightRet[2];
                }

                allMatchs.push({
                    width: width,
                    height: height,
                    fileId: fileId,
                    all: all
                });
                // 下一个
                matches = reg.exec(content);
            }

            return allMatchs;
        },

        findAllAttachs: function (content) {
            const reg = new RegExp('<a[^>]*?href=["\']?' + Api.evtService.getAttachLocalUrlPrefix() + '\\?fileId=([0-9a-zA-Z]{24})["\']?.*?>([^<]*)</a>', 'g');
            let matches = reg.exec(content);

            // 先找到所有的
            const allMatchs = [];
            while (matches) {
                const all = matches[0];

                const fileId = matches[1];
                const title = matches[2];

                allMatchs.push({
                    fileId: fileId,
                    title: title,
                    isAttach: true,
                    all: all
                });
                // 下一个
                matches = reg.exec(content);
            }
            return allMatchs;
        },


        fixResources: function (content, callback) {
            const me = this;

            const allImages = me.findAllImages(content) || [];
            const allAttachs = me.findAllAttachs(content) || [];

            const allMatchs = allImages.concat(allAttachs);

            // console.log(allMatchs);

            if (allMatchs.length === 0) {
                callback(content, '');
                return;
            }

            let resources = '';
            const fileIdFixed = {};

            const fileInfos = {}; // fileId =>
            const fileRendered = {};

            function replaceContent() {
                for (let i = 0; i < allMatchs.length; ++i) {
                    const eachMatch = allMatchs[i];
                    const fileInfo = fileInfos[eachMatch.fileId];
                    if (!fileInfo) {
                        continue;
                    }

                    let media = '<en-media';
                    if (!eachMatch.isAttach) {
                        if (eachMatch.width) {
                            media += ' width="' + eachMatch.width + '"';
                        }
                        if (eachMatch.height) {
                            media += ' height="' + eachMatch.height + '"';
                        } else {
                            media += ' style="height:auto"';
                        }
                    } else {
                        media += ' height="43"'; // style="cursor:pointer;"';
                    }

                    media += ' type="' + fileInfo.type + '"';

                    media += ' hash="' + fileInfo.md5 + '"';
                    media += ' />';
                    content = content.replace(eachMatch.all, media);

                    if (!fileRendered[eachMatch.fileId]) {
                        resources += me.renderResource(fileInfo);
                        fileRendered[eachMatch.fileId] = true;
                    }
                }
            }

            // 再一个个来
            async.eachSeries(allMatchs, function (eachMatch, cb) {
                const fileId = eachMatch.fileId;

                if (fileIdFixed[fileId]) {
                    cb();
                    return;
                }

                const server = eachMatch.isAttach ? Api.fileService.getAttachInfo : Api.fileService.getImageInfo;
                server.call(Api.fileService, fileId, function (err, doc) {
                    fileIdFixed[fileId] = true;
                    if (doc) {
                        const base64AndMd5 = Api.fileService.getFileBase64AndMd5(doc.Path);
                        if (base64AndMd5) {
                            base64AndMd5.createdTime = doc.CreatedTime;
                            base64AndMd5.name = eachMatch.title || doc.Name;
                            base64AndMd5.type = Api.fileService.getFileType(doc.Type);
                            fileInfos[fileId] = base64AndMd5;
                        }
                        cb();
                    } else {
                        cb();
                    }
                });

            }, function () {
                replaceContent();

                callback(content, resources);
            });
        },

        // 得到可用的文件名, 避免冲突
        getExportedFilePath: function (pathInfo, n, cb) {
            const me = this;
            if (n > 1) {
                pathInfo.nameNotExt = pathInfo.nameNotExtRaw + '-' + n;
            }
            const absPath = pathInfo.getFullPath();

            // Api.NodeFs.existsSync(absPath) 总是返回false, 不知道什么原因
            // 在控制台上是可以的
            Api.NodeFs.exists(absPath, function (exists) {
                if (!exists) {
                    cb(absPath);
                } else {
                    me.getExportedFilePath(pathInfo, n + 1, cb);
                }
            });
        },

        getTargetPath: function (callback) {
            // showSaveDialog 不支持property选择文件夹
            const po = Api.gui.dialog.showOpenDialog(
                Api.gui.getCurrentWindow(), {
                    defaultPath: Api.getDefaultPath(),
                    properties: ['openDirectory']
                }
            );

            if (typeof (po) != "object") {
                return;
            }

            po.then(function (re) {
                if (re.canceled !== false || re.filePaths.length < 1) {
                    return callback();
                }
                Api.saveLastPath(re.filePaths[0])
                callback(re.filePaths[0]);
            });
        },

        loadingIsClosed: false,

        exportEvernoteForNotebook: function (notebookId) {
            const me = this;
            if (!notebookId) {
                return;
            }

            // 创建一个内部函数来处理目录选择和检查
            function tryExport(targetPath) {
                if (!targetPath) {
                    return;
                }

                // 直接获取笔记本信息
                let notebook = Api.notebook.getNotebook(notebookId);
                // 创建以笔记本名称命名的子文件夹
                let notebookName = me.fixFilename(notebook.Title);
                let newPath = targetPath + '/' + notebookName;

                // 检查目标路径是否存在同名文件或文件夹
                try {
                    if (Api.NodeFs.existsSync(newPath)) {
                        // 弹出警告对话框
                        Api.gui.dialog.showMessageBoxSync(Api.gui.getCurrentWindow(), {
                            type: 'warning',
                            buttons: ['确定'],
                            title: '警告',
                            message: '目录 "' + notebookName + '" 已存在，请选择其他目录保存。'
                        });
                        // 重新调用getTargetPath让用户选择新目录
                        me.getTargetPath(function (newTargetPath) {
                            tryExport(newTargetPath);
                        });
                        return;
                    }

                    // 创建新目录
                    Api.NodeFs.mkdirSync(newPath);
                    targetPath = newPath;
                } catch (e) {
                    console.error(e);
                    return;
                }

                me.loadingIsClosed = false;
                Api.loading.show(Api.getMsg('plugin.export_evernote.Exporting'), {
                    hasProgress: true,
                    isLarge: true,
                    onClose: function () {
                        me.loadingIsClosed = true;
                        setTimeout(function () {
                            me.hideLoading();
                        });
                    }
                });
                Api.loading.setProgress(1);

                // 递归处理笔记本及其子笔记本
                function processNotebook(notebookId, currentPath) {
                    return new Promise((resolve) => {
                        let allNotes = [];
                        let currentNotebook = Api.notebook.getNotebook(notebookId);

                        // 获取当前笔记本的所有笔记
                Api.noteService.getNotes(notebookId, function (notes) {
                            if (notes) {
                                allNotes = allNotes.concat(notes);
                            }

                            // 获取子笔记本
                            let children = Api.notebook.getSubNotebooks(notebookId);
                            if (!children || children.length === 0) {
                                resolve({notes: allNotes, total: allNotes.length});
                                return;
                            }

                            // 处理每个子笔记本
                            let processed = 0;
                            children.forEach(function (child) {
                                // 为子笔记本创建文件夹
                                let childPath = currentPath + '/' + me.fixFilename(child.Title);
                                try {
                                    if (!Api.NodeFs.existsSync(childPath)) {
                                        Api.NodeFs.mkdirSync(childPath);
                                    }
                                } catch (e) {
                                    console.error(e);
                        return;
                    }

                                // 递归处理子笔记本
                                processNotebook(child.NotebookId, childPath).then(function (result) {
                                    allNotes = allNotes.concat(result.notes);
                                    processed++;
                                    if (processed === children.length) {
                                        resolve({notes: allNotes, total: allNotes.length});
                                    }
                                });
                            });
                        });
                    });
                }

                // 开始处理整个笔记本树
                processNotebook(notebookId, targetPath).then(function (result) {
                    const total = result.notes.length;
                    let i = 0;
                    async.eachSeries(result.notes, function (note, cb) {
                        if (me.loadingIsClosed) {
                            cb();
                            me.hideLoading();
                            return;
                        }
                        i++;
                        Api.loading.setProgress(100 * i / total);

                        // 确定笔记保存的路径
                        let noteNotebook = Api.notebook.getNotebook(note.NotebookId);
                        let notePath = targetPath;
                        if (noteNotebook.NotebookId !== notebookId) {
                            // 构建完整的路径
                            let path = [];
                            let current = noteNotebook;
                            while (current && current.NotebookId !== notebookId) {
                                path.unshift(me.fixFilename(current.Title));
                                // 使用 ParentNotebookId 获取父笔记本
                                current = Api.notebook.getNotebook(current.ParentNotebookId);
                            }
                            notePath = targetPath + '/' + path.join('/');
                        }

                        me._exportEvernote(note, notePath, function () {
                            cb();
                        }, i, total);
                    }, function () {
                        me.hideLoading();
                        Notify.show({title: 'Info', body: getMsg('plugin.export_evernote.exportSuccess')});
                    });
                });
            }

            // 初始调用
            me.getTargetPath(function (targetPath) {
                tryExport(targetPath);
            });
        },

        hideLoading: function () {
            setTimeout(function () {
                Api.loading.hide();
            }, 1000);
        },

        exportEvernote: function (noteIds) {
            const me = this;
            if (!noteIds || noteIds.length === 0) {
                return;
            }
            me.getTargetPath(function (targetPath) {
                if (!targetPath) {
                    return;
                }

                me.loadingIsClosed = false;
                Api.loading.show(Api.getMsg('plugin.export_evernote.Exporting'), {
                    hasProgress: true,
                    isLarge: true,
                    onClose: function () {
                        me.loadingIsClosed = true;
                        setTimeout(function () {
                            me.hideLoading();
                        });
                    }
                });
                Api.loading.setProgress(1);

                let i = 0;
                const total = noteIds.length;

                async.eachSeries(noteIds, function (noteId, cb) {
                    if (me.loadingIsClosed) {
                        cb();
                        return;
                    }

                    i++;
                    Api.loading.setProgress(100 * i / total);
                    Api.noteService.getNote(noteId, function (note) {
                        me._exportEvernote(note, targetPath, function () {
                            cb();
                        }, i, total);
                    });

                }, function () {
                    me.hideLoading();
                    Notify.show({title: 'Info', body: getMsg('plugin.export_evernote.exportSuccess')});
                });
            });
        },

        _exportEvernote: function (note, path, callback, i, total) {
            const me = this;
            if (!note) {
                return;
            }

            if (me.loadingIsClosed) {
                callback();
                return;
            }

            setTimeout(function () {
                Api.loading.setMsg(Api.getMsg('plugin.export_evernote.Exporting: ') + (note.Title || getMsg('Untitled')));
                Api.loading.setProgressRate(i + '/' + total);
            }, 100);

            let name = note.Title ? note.Title + '.enex' : getMsg('Untitled') + '.enex';
            name = me.fixFilename(name);

            const targetPath = path + Api.commonService.getPathSep() + name;

            // 将路径和名字区分开
            const pathInfo = Api.commonService.splitFile(targetPath);
            pathInfo.nameNotExt = me.fixFilename(pathInfo.nameNotExt); // 重新修正一次
            const nameNotExt = pathInfo.nameNotExt;
            pathInfo.nameNotExtRaw = pathInfo.nameNotExt;

            // 得到可用文件的绝对路径
            me.getExportedFilePath(pathInfo, 1, function (absEvernoteFilePath) {
                me.render(note, function (content) {
                    Api.commonService.writeFile(absEvernoteFilePath, content);
                    callback();
                });
            });
        },

        // 打开前要执行的
        onOpen: function () {
            const me = this;
            const gui = Api.gui;

            const menu = {
                label: Api.getMsg('plugin.export_evernote.export'),
                enabled: function (noteIds) {
                    return true;
                },
                click: (function () {
                    return function (noteIds) {
                        me.init();
                        me.exportEvernote(noteIds);
                    }
                })()
            };
            Api.addExportMenu(menu);

            Api.addExportMenuForNotebook({
                label: Api.getMsg('plugin.export_evernote.export'),
                enabled: function (notebookId) {
                    return true;
                },
                click: (function () {
                    return function (notebookId) {
                        me.init();
                        me.exportEvernoteForNotebook(notebookId);
                    }
                })()
            });
        },
        // 打开后
        onOpenAfter: function () {
        },
        // 关闭时需要运行的
        onClose: function () {
        }
    };
});