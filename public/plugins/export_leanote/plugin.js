/**
 * 导出Leanote插件
 * @author  life life@leanote.com
 * 导出的格式为json, 后缀名为 .leanote

 {
	exportDate: '2015-10-12 12:00:00',
	app: 'leanote.desktop.app.mac',
	appVersion: '1.0',
	notes: [
		{
			title: 'life',
			content: 'laldfadf', // 图片, 附件链接为 leanote://file/getImage?fileId=xxxx, leanote://file/getAttach?fileId=3232323
			tags: [1,2,3],
			isMarkdown: true,
			author: 'leanote', // 作者, 没用
			createdTime: '2015-10-12 12:00:00',
			updatedTime: '2015-10-12 12:00:00',
			files: [
				{fileId: '', base64: '', md5: '', type: 'png', 'isAttach': false, createdTime: '2031-12-31 12:12:32'}
				{fileId: '', base64: '', md5: '', type: 'png', 'isAttach': false, createdTime: '2031-12-31 12:12:32'}
			]
		}
	]
 }

 * 
 */
define(function() {
	let async; //  = require('async');

	//===========
	// start

	return {
		langs: {
			'en-us': {
				'export': 'Export Leanote',
				'Exporting': 'Exporting',
				'Exporting: ': 'Exporting: ',
				'exportSuccess': 'Leanote saved successful!',
				'exportFailure': 'Leanote saved failure!',
				'notExists': 'Please sync your note to ther server firslty.'
			},
			'de-de': {
				'export': 'Als Leanote exportieren',
				'Exporting': 'Exportiere',
				'Exporting: ': 'Exportiere: ',
				'exportSuccess': 'Leanote erfolgreich gespeichert!',
				'exportFailure': 'Leanote speichern fehlgeschlagen!',
				'notExists': 'Bitte Notizen zuerst mit dem Server synchronisieren.'
			},
			'zh-cn': {
				'export': '导出Leanote',
				'Exporting': '正在导出',
				'Exporting: ': '正在导出: ',
				'exportSuccess': 'Leanote导出成功!',
				'exportFailure': 'Leanote导出失败!'
			},
			'zh-hk': {
				'export': '導出Leanote',
				'Exporting': '正在導出',
				'Exporting: ': '正在導出: ',
				'exportSuccess': 'Leanote導出成功!',
				'exportFailure': 'Leanote導出失敗!'
			}
		},

		_inited: false,
		init: function() {
			const me = this;
			if (me._inited) {
				return;
			}

			async = require('async');

			me._inited = true;
		},

		replaceAll: function(src, pattern, to) {
			if(!src) {
				return src;
			}
			while(true) {
				const oldSrc = src;
				src = src.replace(pattern, to);
				if(oldSrc === src) {
					return src;
				}
			}
		},

		fixFilename: function(filename) {
			const reg = new RegExp("[/#$!^*\' \"%&()+,:;<>=?@|\\\\]", 'g');
			filename = filename.replace(reg, "-");
			// 防止出现两个连续的-
			while(filename.indexOf('--') !== -1) {
				filename = this.replaceAll(filename, '--', '-');
			}
			if (filename.length > 1) {
				// 最后一个-
				filename = filename.replace(/-$/, '');
			}
			return filename;
		},

		fixContent: function (content) {
			// srip unsage attrs
			const unsafeAttrs = ['id', , /on\w+/i, /data-\w+/i, 'clear', 'target'];
			content = content.replace(/<([^ >]+?) [^>]*?>/g, Api.Resanitize.filterTag(Api.Resanitize.stripAttrs(unsafeAttrs)));

		    // strip unsafe tags
		    content = Api.Resanitize.stripUnsafeTags(content, 
		    	['wbr','style', 'comment', 'plaintext', 'xmp', 'listing',
			  'applet','base','basefont','bgsound','blink','body','button','dir','embed','fieldset','frameset','head',
			  'html','iframe','ilayer','input','isindex','label','layer','legend','link','marquee','menu','meta','noframes',
			  'noscript','object','optgroup','option','param','plaintext','script','select','style','textarea','xml']
			  );
		    return content;
		},

		getLeanoteTime: function(t) {
			// 20151026T033928Z
			// 2015 10 26 T 03 39 28 Z
			// console.log(t);
			if (!t) {
				t = new Date();
			}
			if (typeof t != 'object' || !('getTime' in t)) {
				try {
					t = new Date(t);
				}
				catch(e) {
					t = new Date();
				}
			}
			return t.format("yyyy-MM-dd hh:mm:ss");
		},
		
		render: function(note, callback) {
			const me = this;
			const appVersion = Api.getCurVersion() || {version: 'unknown'};
			const info = {
				exportDate: me.getLeanoteTime(),
				app: 'leanote.desktop.app.' + process.platform,
				appVersion: appVersion.version,
				apiVersion: '0.1',
				notes: []
			};
			me.fixFiles(note, function (content, files) {
				// 非markdown才需要这样, 补全html标签
				if (!note.IsMarkdown) {
					content = $('<div>' + content + '</div>').html();
				}

				const filesArr = [];
				files || (files = {});
				for (let fileId in files) {
					if (files.hasOwnProperty(fileId)) {
						files[fileId].fileId = fileId;
						filesArr.push(files[fileId]);
					}
				}

				const noteInfo = {
					title: note.Title,
					content: !note.IsMarkdown ? me.fixContent(content) : content,
					tags: note.Tags,
					author: Api.userService.email || Api.userService.username || '',
					isMarkdown: note.IsMarkdown,
					createdTime: me.getLeanoteTime(note.CreatedTime),
					updatedTime: me.getLeanoteTime(note.UpdatedTime),
					files: filesArr
				};
				info.notes.push(noteInfo);
				callback(JSON.stringify(info, null, 2));
				/*
				enml.ENMLOfHTML(content, function(err, ENML) {
					if (err) {
						info.content = content;
					}
					else {
						info.content = ENML;
					}

					if (note.IsMarkdown) {
						info.content = '<pre>' + info.content + '</pre>';
					}

					callback(me.renderTpl(tpl, info, keys));
				});
				*/
			});
		},

		findAllImages: function (note) {
			const content = note.Content;
			const allMatchs = [];

			// markdown下
			// [](http://localhost://fileId=32);
			if (note.IsMarkdown) {
				var reg = new RegExp('!\\[([^\\]]*?)\\]\\(' + Api.evtService.getImageLocalUrlPrefix() + '\\?fileId=([0-9a-zA-Z]{24})\\)', 'g');
				var matches = reg.exec(content);
				while(matches) {
				    var all = matches[0];
					const title = matches[1]; // img与src之间
				    var fileId = matches[2];
				    allMatchs.push({
				    	fileId: fileId,
				    	title: title,
				    	all: all
				    });
				    // 下一个
				    matches = reg.exec(content);
				}
			}
			else {
				var reg = new RegExp('<img([^>]*?)src=["\']?' + Api.evtService.getImageLocalUrlPrefix() + '\\?fileId=([0-9a-zA-Z]{24})["\']?(.*?)>', 'g');
				var matches = reg.exec(content);
				while(matches) {
				    var all = matches[0];
					const pre = matches[1]; // img与src之间
				    var fileId = matches[2];
					const back = matches[3]; // src与>之间
				    allMatchs.push({
				    	fileId: fileId,
				    	pre: pre,
				    	back: back,
				    	all: all
				    });
				    // 下一个
				    matches = reg.exec(content);
				}
			}

			return allMatchs;
		},

		findAllAttachs: function (note) {
			const content = note.Content;

			const allMatchs = [];
			// markdown下
			// ![](http://localhost://fileId=32);
			if (note.IsMarkdown) {
				var reg = new RegExp('\\[([^\\]]*?)\\]\\(' + Api.evtService.getAttachLocalUrlPrefix() + '\\?fileId=([0-9a-zA-Z]{24})\\)', 'g');
				var matches = reg.exec(content);
				while(matches) {
				    var all = matches[0];
				    var title = matches[1]; // img与src之间
				    var fileId = matches[2];
				    allMatchs.push({
				    	fileId: fileId,
				    	title: title,
				    	all: all,
				    	isAttach: true
				    });
				    // 下一个
				    matches = reg.exec(content);
				}
			}
			else {
				var reg = new RegExp('<a([^>]*?)href=["\']?' + Api.evtService.getAttachLocalUrlPrefix() + '\\?fileId=([0-9a-zA-Z]{24})["\']?(.*?)>([^<]*)</a>', 'g');
				var matches = reg.exec(content);

				while(matches) {
				    var all = matches[0];
					const pre = matches[1]; // a 与href之间
				    var fileId = matches[2];
					const back = matches[3]; // href与>之间
				    var title = matches[4];

				    allMatchs.push({
				    	fileId: fileId,
				    	title: title,
				    	pre: pre,
				    	back: back,
				    	isAttach: true,
				    	all: all
				    });
				    // 下一个
				    matches = reg.exec(content);
				}
			}
			return allMatchs;
		},

		fixFiles: function (note, callback) {
			const me = this;

			let content = note.Content;

			const allImages = me.findAllImages(note) || [];
			const allAttachs = me.findAllAttachs(note) || [];

			const allMatchs = allImages.concat(allAttachs);

			if (allMatchs.length === 0) {
				callback(content, []);
				return;
			}

			const files = {}; // fileId => {}

			function replaceContent () {
				for (let i = 0; i < allMatchs.length; ++i) {
					const eachMatch = allMatchs[i];
					const fileInfo = files[eachMatch.fileId];

					let link;
					if (!fileInfo) {
						link = '';
					}
					else {
						if (note.IsMarkdown) {
							var href;
							if (!eachMatch.isAttach) {
								href = 'leanote://file/getImage?fileId=' + eachMatch.fileId;
								link = '![' + eachMatch.title + '](' + href + ')';
							}
							else {
								href = 'leanote://file/getAttach?fileId=' + eachMatch.fileId;
								link = '[' + eachMatch.title + '](' + href + ')';
							}
						}
						else {
							if (!eachMatch.isAttach) {
								var href = 'leanote://file/getImage?fileId=' + eachMatch.fileId;
								link = '<img ' + eachMatch.pre + 'src="' + href + '"' + eachMatch.back + '>';
							}
							else {
								var href = 'leanote://file/getAttach?fileId=' + eachMatch.fileId;
								link = '<a ' + eachMatch.pre + 'href="' + href + '"' + eachMatch.back + '>' + eachMatch.title + '</a>';
							}
						}
					}

					content = content.replace(eachMatch.all, link);
				}
			}

			// 附件
			const attachs = note.Attachs || [];
			for (var i = 0; i < attachs.length; ++i) {
				const attach = attachs[i];
				var base64AndMd5 = Api.fileService.getFileBase64AndMd5(attach.Path);
				if (base64AndMd5) {
					files[attach.FileId] = {
						base64: base64AndMd5.base64,
						md5: base64AndMd5.md5,
						type: attach.Type,
						title: attach.Title,
						createdTime: me.getLeanoteTime(attach.UpdatedTime || attach.CreatedTime),
						isAttach: true
					}
				}
			}

			// 得到图片资源
			const fileIdFixed = {};
			async.eachSeries(allImages, function(eachMatch, cb) {
				const fileId = eachMatch.fileId;
				if (fileIdFixed[fileId]) {
			    	cb();
			    	return;
			    }

			    Api.fileService.getImageInfo(fileId, function(err, doc) {
					fileIdFixed[fileId] = true;
					if(doc) {
						const base64AndMd5 = Api.fileService.getFileBase64AndMd5(doc.Path);
						if (base64AndMd5) {
							files[doc.FileId] = {
								base64: base64AndMd5.base64,
								md5: base64AndMd5.md5,
								type: doc.Type,
								title: doc.Title,
								createdTime: me.getLeanoteTime(doc.UpdatedTime || doc.CreatedTime),
							}
						}
						cb();
					}
					else {
						cb();
					}
				});

			}, function () {
				replaceContent();
				callback(content, files);
			});
		},

		//--------------

		// 得到可用的文件名, 避免冲突
		getExportedFilePath: function(pathInfo, n, cb) {
			const me = this;
			if(n > 1) {
				pathInfo.nameNotExt = pathInfo.nameNotExtRaw + '-' + n; 
			}
			const absPath = pathInfo.getFullPath();

			// Api.NodeFs.existsSync(absPath) 总是返回false, 不知道什么原因
			// 在控制台上是可以的
			Api.NodeFs.exists(absPath, function(exists) {
				if(!exists) {
					cb(absPath);
				}
				else {
					me.getExportedFilePath(pathInfo, n+1, cb);
				}
			});
		},

		getTargetPath: function(callback) {
			// showSaveDialog 不支持property选择文件夹
			const po = Api.gui.dialog.showOpenDialog(Api.gui.getCurrentWindow(),
				{
					defaultPath: Api.getDefaultPath(),
					properties: ['openDirectory']
				}
			);

			if (typeof(po) != "object") {
				return;
			}

			po.then((re) => {
    			if(re.canceled !== false || re.filePaths.length < 1){
					return;
				}
                Api.saveLastPath(re.filePaths[0])
				callback(re.filePaths[0]);
			});
		},

		loadingIsClosed: false,

		exportLeanoteForNotebook: function (notebookId) {
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
				Api.loading.show(Api.getMsg('plugin.export_leanote.Exporting'), 
					{
						hasProgress: true, 
						isLarge: true,
						onClose: function () {
							me.loadingIsClosed = true;
							setTimeout(function() {
								me.hideLoading();
						});
				}});
				Api.loading.setProgress(1);

                // 递归处理笔记本及其子笔记本
                function processNotebook(notebookId, currentPath) {
                    return new Promise((resolve) => {
                        let allNotes = [];
                        let currentNotebook = Api.notebook.getNotebook(notebookId);

                        // 获取当前笔记本的所有笔记
				Api.noteService.getNotes(notebookId, function(notes) {
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

                        me._exportLeanote(note, notePath, function () {
							cb();
		        		}, i, total);
					}, function() {
						me.hideLoading();
						Notify.show({title: 'Info', body: getMsg('plugin.export_leanote.exportSuccess')});
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

		exportLeanote: function (noteIds) {
			const me = this;
			if (!noteIds || noteIds.length === 0) {
				return;
			}
			me.getTargetPath(function(targetPath) {
				if (!targetPath) {
					return;
				}

				me.loadingIsClosed = false;
				Api.loading.show(Api.getMsg('plugin.export_leanote.Exporting'), 
					{
						hasProgress: true, 
						isLarge: true,
						onClose: function () {
							me.loadingIsClosed = true;
							setTimeout(function() {
								me.hideLoading();
						});
				}});
				Api.loading.setProgress(1);

				let i = 0;
				const total = noteIds.length;

				async.eachSeries(noteIds, function(noteId, cb) {
					if (me.loadingIsClosed) {
						cb();
						return;
					}

					i++;
					Api.loading.setProgress(100 * i / total);
					Api.noteService.getNote(noteId, function(note) {
		        		me._exportLeanote(note, targetPath, function() {
		        			cb();
		        		}, i, total);
	        		});

				}, function () {
					me.hideLoading();
					Notify.show({title: 'Info', body: getMsg('plugin.export_leanote.exportSuccess')});
				});
			});
		},

		_exportLeanote: function(note, path, callback, i, total) {
			const me = this;
			if(!note) {
				return;
			}

			if (me.loadingIsClosed) {
				callback();
				return;
			}

			setTimeout(function () {
				Api.loading.setMsg(Api.getMsg('plugin.export_leanote.Exporting: ') + (note.Title || getMsg('Untitled')));
				Api.loading.setProgressRate(i + '/' + total);
			}, 100);

			let name = note.Title ? note.Title + '.leanote' : getMsg('Untitled') + '.leanote';
			name = me.fixFilename(name);

			const targetPath = path + Api.commonService.getPathSep() + name;

			// 将路径和名字区分开
			const pathInfo = Api.commonService.splitFile(targetPath);
			pathInfo.nameNotExt = me.fixFilename(pathInfo.nameNotExt); // 重新修正一次
			const nameNotExt = pathInfo.nameNotExt;
			pathInfo.nameNotExtRaw = pathInfo.nameNotExt;

			// 得到可用文件的绝对路径
			me.getExportedFilePath(pathInfo, 1, function(absLeanoteFilePath) {
				me.render(note, function (content) {
					Api.commonService.writeFile(absLeanoteFilePath, content);
					callback();
				});
			});
		},

		// 打开前要执行的
		onOpen: function() {
			const me = this;
			const gui = Api.gui;

			const menu = {
				label: Api.getMsg('plugin.export_leanote.export'),
				enabled: function (noteIds) {
					return true;
				},
				click: (function () {
					return function (noteIds) {
						me.init();
						me.exportLeanote(noteIds);
					}
				})()
			};
			Api.addExportMenu(menu);

		    Api.addExportMenuForNotebook({
		        label: Api.getMsg('plugin.export_leanote.export'),
		        enabled: function(notebookId) {
		        	return true;
		        },
		        click: (function() {
		        	return function(notebookId) {
		        		me.init();
		        		me.exportLeanoteForNotebook(notebookId);
		        	}
		        })()
		    });
		},
		// 打开后
		onOpenAfter: function() {
		},
		// 关闭时需要运行的
		onClose: function() {
		}
	};
});
