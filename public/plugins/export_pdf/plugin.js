/**
 * 导出PDF插件
 * @author  life life@leanote.com
 * 选择目录, 将图片保存到文件夹中, 有个html文件(以笔记名命名)
 * 注意, fs.existsSync总返回false, readFileSync可用
 */
define(function() {
    let async; // = require('async');

    return {
        langs: {
            'en-us': {
                'export': 'Export PDF',
                'Exporting': 'Exporting',
                'Exporting: ': 'Exporting: ',
                'exportSuccess': 'PDF saved successful!',
                'exportFailure': 'PDF saved failure!',
            },
            'de-de': {
                'export': 'Als PDF exportieren',
                'Exporting': 'Exportiere',
                'Exporting: ': 'Exportiere: ',
                'exportSuccess': 'PDF erfolgreich gespeichert!',
                'exportFailure': 'PDF speichern fehlgeschlagen!',
            },
            'zh-cn': {
                'export': '导出PDF',
                'Exporting': '正在导出',
                'Exporting: ': '正在导出: ',
                'exportSuccess': 'PDF导出成功!',
                'exportFailure': 'PDF导出失败!'
            },
            'zh-hk': {
                'export': '導出PDF',
                'Exporting': '正在導出',
                'Exporting: ': '正在導出: ',
                'exportSuccess': 'PDF導出成功!',
                'exportFailure': 'PDF導出失敗!'
            }
        },

        _inited: false,
        init: function () {
            const me = this;
            if (me._inited) {
                return;
            }
            async = require('async');
            me._inited = true;
            me._initExportPdf();
        },

        // 调用main导出pdf
        _exportPdfSeq: 1,
        _exportPdfCallback: {},
        _initExportPdf: function () {
            const me = this;
            // console.log('_initExportPdf');
            Api.ipc.on('export-pdf-ret', function (event, arg) {
                const seq = arg.seq;
                // console.log('export-pdf-ret');
                // console.log(arg);
                // console.log(me._exportPdfCallback[seq]);
                if (me._exportPdfCallback[seq]) {
                    me._exportPdfCallback[seq](arg);
                }
            });
        },
        exportPdf: function (htmlPath, targetPdfPath, isMarkdown, callback) {
            this._exportPdfSeq++;
            this._exportPdfCallback[this._exportPdfSeq] = callback;
            Api.ipc.send('export-pdf', {
                htmlPath: htmlPath,
                targetPdfPath: targetPdfPath,
                isMarkdown: isMarkdown,
                seq: this._exportPdfSeq
            });
        },

        getPluginPath: function () {
            return Api.evtService.getProjectBasePath() + '/public/plugins/export_pdf';
        },

        htmlTpl: '',
        markdownTpl: '',
        getTpl: function (isMarkdown) {
            let tpl = isMarkdown ? this.markdownTpl : this.htmlTpl;
            if (tpl) {
                return tpl;
            }
            const basePluginPath = this.getPluginPath();

            const tplName = isMarkdown ? 'markdown' : 'html';
            const tplPath = basePluginPath + '/tpl/' + tplName + '.tpl';
            tpl = Api.NodeFs.readFileSync(tplPath, 'utf-8');
            isMarkdown ? (this.markdownTpl = tpl) : (this.htmlTpl = tpl);
            return tpl;
        },
        // 生成html或markdown
        render: function (note) {
            let tpl = this.getTpl(note.IsMarkdown);
            const title = note.Title || getMsg('Untitled');
            tpl = tpl.replace(/\{title\}/g, title);
            tpl = tpl.replace("{content}", function () {
                return note.Content; // 为什么要这样? 因为 $$ 替换后变成了一个!!
            });
            return tpl;
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

        // 得到可用的文件名, 避免冲突
        getPdfFilePath: function (pathInfo, n, cb) {
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
                    me.getPdfFilePath(pathInfo, n + 1, cb);
                }
            });
        },

        getTargetPath: function (callback) {
            // showSaveDialog 不支持property选择文件夹
            const po = Api.gui.dialog.showOpenDialog(Api.gui.getCurrentWindow(), {
                defaultPath: Api.getDefaultPath(),
                properties: ['openDirectory']
            });
            if (typeof (po) !== "object") {
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

        exportPDFForNotebook: function (notebookId) {
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
                Api.loading.show(Api.getMsg('plugin.export_pdf.Exporting'), {
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

                        me._exportPDF(note, notePath, function () {
                            cb();
                        }, i, total);
                    }, function () {
                        me.hideLoading();
                        Notify.show({title: 'Info', body: getMsg('plugin.export_pdf.exportSuccess')});
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

        exportPDF: function (noteIds) {
            const me = this;
            if (!noteIds || noteIds.length === 0) {
                return;
            }
            me.getTargetPath(function (targetPath) {
                if (!targetPath) {
                    return;
                }

                me.loadingIsClosed = false;
                Api.loading.show(Api.getMsg('plugin.export_pdf.Exporting'), {
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

                        me._exportPDF(note, targetPath, function (ok) {
                            cb();
                        }, i, total);
                    });

                }, function () {
                    me.hideLoading();
                    Notify.show({title: 'Info', body: getMsg('plugin.export_pdf.exportSuccess')});
                });
            });
        },

        _exportPDF: function (note, path, callback, i, total) {
            const me = this;
            if (!note) {
                return;
            }

            if (me.loadingIsClosed) {
                callback();
                return;
            }

            setTimeout(function () {
                Api.loading.setMsg(Api.getMsg('plugin.export_pdf.Exporting: ') + (note.Title || getMsg('Untitled')));
                Api.loading.setProgressRate(i + '/' + total);
            }, 100);

            let name = note.Title ? note.Title + '.pdf' : getMsg('Untitled') + '.pdf';
            name = me.fixFilename(name);

            const targetPath = path + Api.commonService.getPathSep() + name;

            // 将路径和名字区分开
            const pathInfo = Api.commonService.splitFile(targetPath);
            pathInfo.nameNotExt = me.fixFilename(pathInfo.nameNotExt); // 重新修正一次
            const nameNotExt = pathInfo.nameNotExt;
            pathInfo.nameNotExtRaw = pathInfo.nameNotExt;

            // 得到可用文件的绝对路径
            me.getPdfFilePath(pathInfo, 1, function (absPdfFilePath) {
                // 得到存放assets的目录
                const html = me.render(note);
                let tempPath = Api.gui.app.getPath('temp');
                const last = tempPath[tempPath.length - 1];
                if (last === '/' || last === '\\') {
                    tempPath = tempPath.substr(0, tempPath.length - 1);
                }
                const targetHtmlPath = tempPath + '/' + (new Date().getTime()) + '.html';

                // 把html文件写到tmp目录
                Api.commonService.writeFile(targetHtmlPath, html);
                me.exportPdf(targetHtmlPath, absPdfFilePath, note.IsMarkdown, function (args) {
                    // console.log('export pdf ret');
                    callback(args.ok);
                });
            });
        },

        // 打开前要执行的
        onOpen: function () {
            const me = this;
            const gui = Api.gui;

            const menu = {
                label: Api.getMsg('plugin.export_pdf.export'),
                enabled: function (noteIds) {
                    return true;
                },
                click: (function () {
                    return function (noteIds) {
                        me.init();
                        me.exportPDF(noteIds);
                    }
                })()
            };
            Api.addExportMenu(menu);

            Api.addExportMenuForNotebook({
                label: Api.getMsg('plugin.export_pdf.export'),
                enabled: function (notebookId) {
                    return true;
                },
                click: (function () {
                    return function (notebookId) {
                        me.init();
                        me.exportPDFForNotebook(notebookId);
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