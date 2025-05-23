const async = require('async');
const fs = require('fs');

const db = require('./db');
const File = require('./file');
const Evt = require('./evt');
const User = require('./user');
const Notebook = require('./notebook');
// var Tag = require('./tag');
// var Api = require('./api');
const Common = require('./common');
const Web = require('./web');

// var Notes = db.notes;

let Api = null; // require('./api')
let Tag = null;

function log(o) {
	console.trace(o);
}

// Web.alertWeb('alert(process.type);');

/*
type NoteOrContent struct {
	NotebookId string
	NoteId string
	UserId string
	Title string
	Desc string
	ImgSrc string
	Tags []string
	Content string
	Abstract string
	IsNew bool
	IsMarkdown bool
	FromUserId string // 为共享而新建
	IsBlog bool // 是否是blog, 更新note不需要修改, 添加note时才有可能用到, 此时需要判断notebook是否设为Blog
}
*/

// 笔记服务
const Note = {
	// 更新笔记
	updateNoteOrContent: function (noteOrContent, callback, needAddToHistory) {
		const me = this;

		// Web.alertWeb(process.type); // render

		const userId = User.getCurActiveUserId();
		noteOrContent['UserId'] = userId;

		const date = new Date();
		if (!Common.isValidDate(noteOrContent.UpdatedTime)) {
			noteOrContent.UpdatedTime = date;
		}

		noteOrContent['IsDirty'] = true; // 已修改
		noteOrContent['LocalIsDelete'] = false;

		// 为什么不以noteOrContent.IsNew来判断是否是新建还是更新?
		// 怕前端重复发请求, 保险起见
		me.getNote(noteOrContent.NoteId, function (dbNote) {
			// 新建的
			if (!dbNote) {
				// 新建笔记, IsNew还是保存着
				if (noteOrContent.IsNew) {
					if (!Common.isValidDate(noteOrContent.CreatedTime)) {
						noteOrContent.CreatedTime = date;
					}
					noteOrContent['IsTrash'] = false;
					delete noteOrContent['IsNew'];
					noteOrContent['LocalIsNew'] = true;

					db.notes.insert(noteOrContent, function (err, newDoc) {   // Callback is optional
						if (err) {
							console.log(err);
							callback && callback(false);
						} else {
							// 为什么又设置成true, 因为js的对象是共享的, callback用到了noteOrContent.IsNew来做判断
							noteOrContent['IsNew'] = true;
							callback && callback(newDoc);

							// 重新统计笔记本的笔记数量
							Notebook.reCountNotebookNumberNotes(noteOrContent.NotebookId);

							me.addNoteHistory(noteOrContent.NoteId, noteOrContent.Content);
						}
					});
				} else {
					callback && callback(false);
				}
			}
			// 更新
			else {
				const updateFields = ['Desc', 'ImgSrc', 'Title', 'Tags', 'Content'];
				const updates = {};
				let needUpdate = false;
				for (let i in updateFields) {
					const field = updateFields[i];
					if (field in noteOrContent) {
						updates[field] = noteOrContent[field];
						needUpdate = true;
					}
				}

				if (needUpdate) {
					let isDirty = false;
					// 只有title, Content, Tags修改了才算是IsDirty
					if ('Content' in updates && dbNote['Content'] !== updates['Content']) {
						isDirty = true;
						// console.error(' content not same');
						// ContentIsDirty 才会发Content
						updates['ContentIsDirty'] = true;

					} else if ('Title' in updates && dbNote['Title'] !== updates['Title']) {
						isDirty = true;
						// console.error(' title not same');
					} else if ('Tags' in updates) {
						const dbTags = dbNote['Tags'] || [];
						const nowTags = updates['Tags'] || [];
						if (dbTags.join(',') !== nowTags.join(',')) {
							isDirty = true;
							// console.error(' tag not same');
						}
					}

					// 没有任何修改
					if (!isDirty) {
						console.log('没有任何修改, 不保存');
						return callback && callback(dbNote);
					}

					updates['IsDirty'] = isDirty;

					updates['LocalIsDelete'] = false;

					if (isDirty) {
						updates.UpdatedTime = date;
					}

					// console.log('finally update:');
					// console.log(updates);

					// Set an existing field's value
					db.notes.update({NoteId: noteOrContent.NoteId}, {$set: updates}, {}, function (err, numReplaced) {
						if (err) {
							callback && callback(false);
						} else {
							callback && callback(noteOrContent);

							if ('Content' in updates) {

								// 需要添加到历史记录中才加
								if (needAddToHistory) {
									me.addNoteHistory(noteOrContent.NoteId, noteOrContent.Content);
								}
							}
						}
					});
				} else {
					callback && callback(false);
				}
			}
		});
	},

	// 公开/取消为博客
	setNote2Blog: function (noteIds, isBlog, callback) {
		const me = this;
		let ok = false;
		async.eachSeries(noteIds, function (noteId, cb) {
			me._setNote2Blog(noteId, isBlog, function (ret) {
				if (ret) {
					ok = true;
				}
				cb();
			});
		}, function () {
			callback(ok);
		});
	},

	_setNote2Blog: function (noteId, isBlog, callback) {
		const me = this;
		me.getNote(noteId, function (note) {
			if (note) {
				if (note.IsBlog === isBlog) {
					return callback && callback(true);
				}
				// 更新, 设置isDirty
				db.notes.update({_id: note._id}, {
					$set: {
						IsBlog: isBlog,
						IsDirty: true
					}
				}, {}, function (err, numReplaced) {
					return callback && callback(true);
				});
			} else {
				return callback && callback(false);
			}
		});
	},

	// 添加笔记历史
	/*
	type NoteContentHistory struct {
		NoteId    bson.ObjectId `bson:"_id,omitempty"`
		UserId    bson.ObjectId `bson:"UserId"` // 所属者
		Histories []EachHistory `Histories`
	}
	 */
	addNoteHistory: function (noteId, content, callback) {
		const me = this;
		db.noteHistories.loadDB(function (ok) {
			if (!ok) {
				callback && callback(false);
				return;
			}
			// 先判断是否存在, 不存在则新建之
			db.noteHistories.findOne({_id: noteId}, function (err, history) {
				const now = new Date();
				// 新建之
				if (!history) {
					db.noteHistories.insert({
						_id: noteId,
						Histories: [{Content: content, "UpdatedTime": now}],
						"UpdatedTime": now
					}, function () {
						callback && callback(true);
					});
				}
				// 更新之
				else {
					const histories = history.Histories;
					// 如果与前一个内容一样, 则不加入历史中
					if (histories
						&& histories[histories.length - 1].Content
						&& histories[histories.length - 1].Content === content) {
						return (callback && callback(true));
					}

					histories.push({Content: content, UpdatedTime: now});

					// 不能多了, 多了有麻烦, 20个最多
					const max = 20;
					const len = histories.length;
					if (len > max) {
						for (let i = 0; i < len - max; ++i) {
							histories.shift();
						}
					}

					db.noteHistories.update({_id: noteId}, {$set: {Histories: histories}}, function () {
						callback && callback(true);
					});
				}
			});
		});
	},

	// 删除笔记时, 删除历史记录
	deleteNoteHistory: function (noteId) {
		db.noteHistories.remove({_id: noteId});
	},

	// 获取笔记历史记录
	getNoteHistories: function (noteId, callback) {
		const me = this;
		db.noteHistories.loadDB(function (ok) {
			if (!ok) {
				callback(false);
				return;
			}
			db.noteHistories.findOne({_id: noteId}, function (err, doc) {
				if (err || !doc) {
					callback([]);
				} else {
					const histories = [];
					for (let i = doc.Histories.length - 1; i >= 0; --i) {
						const history = doc.Histories[i];
						let content, updatedTime;
						if (typeof history == 'object') {
							content = history.Content;
							updatedTime = history.UpdatedTime;
						} else {
							content = history;
							updatedTime = doc.UpdatedTime || new Date();
						}
						histories.push({Content: content, UpdatedTime: updatedTime});
					}
					callback(histories);
				}
			});
		});
	},

	// 获取笔记列表
	getNotes: function (notebookId, callback) {
		const me = this;
		me._getNotes(notebookId, false, false, callback);
	},
	// 获取trash笔记
	getTrashNotes: function (callback) {
		const me = this;
		me._getNotes('', true, false, callback);
	},
	getStarNotes: function (callback) {
		const me = this;
		me._getNotes('', false, true, callback);
	},
	_getNotes: function (notebookId, isTrash, isStar, callback) {
		const userId = User.getCurActiveUserId();
		const query = {
			UserId: userId,
			// 现在还不明确为什么会有IsDeleted的笔记
			$or: [
				{IsDeleted: {$exists: false}},
				{IsDeleted: false}
			],
			IsTrash: false,
			LocalIsDelete: false, // 未删除的
		};
		if (isStar) {
			query['Star'] = true;
		}
		if (notebookId) {
			query['NotebookId'] = notebookId;
		}
		if (isTrash) {
			query['IsTrash'] = true;
		}
		db.notes.find(query).sort({'UpdatedTime': -1}).exec(function (err, notes) {
			if (err) {
				log(err);
				return callback && callback(false);
			}
			return callback && callback(notes);
		});
	},

	searchNote: function (key, callback) {
		const reg = new RegExp(key, 'i');
		const userId = User.getCurActiveUserId();
		db.notes.find({
			UserId: userId,
			IsTrash: false,
			LocalIsDelete: false,
			$or: [{Title: reg}, {Content: reg}]
		}).sort({'UpdatedTime': -1}).exec(function (err, notes) {
			if (!err && notes) {
				console.log('search ' + key + ' result: ' + notes.length);
				callback(notes);
			} else {
				callback([]);
			}
		});
	},

	searchNoteByTag: function (tag, callback) {
		const userId = User.getCurActiveUserId();
		db.notes.find({
			UserId: userId,
			IsTrash: false,
			LocalIsDelete: false,
			Tags: {$in: [tag]}
		}).sort({'UpdatedTime': -1}).exec(function (err, notes) {
			if (!err && notes) {
				console.log('search by tag: ' + tag + ' result: ' + notes.length);
				callback(notes);
			} else {
				callback([]);
			}
		});
	},

	clearTrash: function (callback) {
		const me = this;
		const userId = User.getCurActiveUserId();
		db.notes.update(
			{UserId: userId, IsTrash: true},
			{$set: {LocalIsDelete: true, IsDirty: true}},
			{multi: true},
			function (err, n) {
				// Web.alertWeb(n);
				callback && callback();
			});
	},

	deleteNote: function (noteIds, callback) {
		const me = this;
		async.eachSeries(noteIds, function (noteId, cb) {
			me._deleteNote(noteId, function () {
				cb();
			});
		}, function () {
			callback(true);
		});
	},

	_deleteNote: function (noteId, callback) {
		const me = this;
		me.getNote(noteId, function (note) {
			if (!note) {
				callback(false);
			}

			// 如果已经是trash, 再删除则彻底删除
			if (note.IsTrash) {
				me.deleteTrash(note, callback);
				return;
			}

			// {multi: true},
			db.notes.update({NoteId: noteId}, {$set: {IsTrash: true, IsDirty: true}}, {multi: true}, function (err, n) {
				if (err || !n) {
					callback(false);
				} else {
					callback(true);
					// 重新统计
					Notebook.reCountNotebookNumberNotes(note.NotebookId);
				}
			});
		});
	},

	// sync时调用
	// 是新的, 又是deleted的, 则删除之
	deleteLocalNote: function (noteId, callback) {
		const me = this;
		this.getNote(noteId, function (note) {
			if (!note) {
				callback && callback();
				return;
			}
			db.notes.remove({NoteId: noteId}, function () {
				me.deleteNoteAllOthers(note);
				callback && callback();
			});
		});
	},

	// 删除笔记的所有
	// 1) notes
	// 2) noteHistory
	// 3) imgages, attachs
	deleteNoteAllOthers: function (note) {
		if (!note) {
			return;
		}
		const me = this;
		// 删除图片
		me.deleteImages(note);
		// 删除附件
		me.deleteAttachs(note.Attachs);
		// 删除历史记录
		me.deleteNoteHistory(note.NoteId);
	},

	// 彻底删除笔记, 如果有tags, 则需要更新tags's count
	deleteTrash: function (note, callback) {
		const me = this;
		if (note) {
			// 如果是本地用户, 则直接删除
			if (User.isLocal()) {
				db.notes.remove({_id: note._id}, {multi: true}, function (err, n) {
					if (n) {
						me.deleteNoteAllOthers(note);
						// 如果有tags, 则重新更新tags' count
						me.updateTagCount(note.Tags);
						callback(true);
						return;
					}
					callback(false);
				});
			} else {
				note.LocalIsDelete = true;
				note.IsDirty = true;
				db.notes.update({_id: note._id}, {$set: {IsDirty: true, LocalIsDelete: true}}, function (err, n) {
					if (n) {
						me.deleteNoteAllOthers(note);
						me.updateTagCount(note.Tags);
						callback(true);
						return;
					}
					callback(false);
				});
			}
		} else {
			callback(false);
		}
	},

	// 移动note
	// 重新统计另一个notebookId的笔记数
	moveNote: function (noteIds, notebookId, callback) {
		const me = this;
		if (Common.isEmpty(noteIds)) {
			callback(false);
			return;
		}

		const preNotebookIds = {};
		async.eachSeries(noteIds, function (noteId, cb) {
			me.getNote(noteId, function (note) {
				if (note) {
					// var to = !note.Star;
					// 是原笔记本
					const preNotebookId = note.NotebookId;
					if (preNotebookId === notebookId && !note.IsTrash) {
						cb();
						return;
					}
					preNotebookIds[preNotebookId] = true;
					note.NotebookId = notebookId;
					db.notes.update({_id: note._id}, {
						$set: {
							IsDirty: true,
							NotebookId: notebookId,
							IsTrash: false,
							LocalIsDelete: false,
							UpdatedTime: new Date()
						}
					}, function (err, n) {
						cb();
					});
				} else {
					cb();
				}
			});

		}, function () {
			// 重新统计
			for (let i in preNotebookIds) {
				Notebook.reCountNotebookNumberNotes(i);
			}
			if (!preNotebookIds[notebookId]) {
				Notebook.reCountNotebookNumberNotes(notebookId);
			}

			callback(true);
		});
	},

	// 加星或取消
	star: function (noteId, callback) {
		const me = this;
		me.getNote(noteId, function (note) {
			if (note) {
				const to = !note.Star;
				db.notes.update({_id: note._id}, {$set: {Star: to, UpdatedTime: new Date()}});
				callback(true, to);
			}
		});
	},

	conflictIsFixed: function (noteId) {
		const me = this;
		db.notes.update({NoteId: noteId}, {$set: {ConflictNoteId: ""}});
	},

	// 笔记本下是否有笔记
	hasNotes: function (notebookId, callback) {
		db.notes.count({NotebookId: notebookId, IsTrash: false, LocalIsDelete: false}, function (err, n) {
			console.log(n);
			if (err || n > 0) {
				return callback(true);
			}
			callback(false);
		});
	},

	// 得到笔记
	getNote: function (noteId, callback) {
		const me = this;
		db.notes.findOne({NoteId: noteId}, function (err, doc) {
			if (err || !doc) {
				log('不存在');
				callback && callback(false);
			} else {
				callback && callback(doc);
			}
		});
	},

	// 服务器上的数据到本地
	fixNoteContent: function (content) {
		if (!content) {
			return content;
		}
		// https, http都行
		const url = Evt.leanoteUrl.replace('https', 'https*');

		// http://leanote.com/file/outputImage?fileId=54f9079f38f4115c0200001b
		const reg0 = new RegExp(url + '/file/outputImage', 'g');
		content = content.replace(reg0, Evt.getImageLocalUrlPrefix());

		const reg = new RegExp(url + '/api/file/getImage', 'g');
		content = content.replace(reg, Evt.getImageLocalUrlPrefix());

		const reg2 = new RegExp(url + '/api/file/getAttach', 'g');
		content = content.replace(reg2, Evt.getAttachLocalUrlPrefix());

		const reg3 = new RegExp(url + '/attach/download?attachId', 'g');
		content = content.replace(reg3, Evt.getAttachLocalUrlPrefix() + '?fileId');

		// 无用
		// api/file/getAllAttachs?noteId=xxxxxxxxx, 这里的noteId是服务器上的noteId啊
		const reg4 = new RegExp(url + '/api/file/getAllAttachs', 'g');
		content = content.replace(reg4, Evt.getAllAttachsLocalUrlPrefix());

		return content;
	},

	// 将本地的url改下, 发送数据到服务器上
	fixNoteContentForSend: function (content) {
		if (!content) {
			return content;
		}

		// console.log(Evt.localUrl + '/api/file/getImage');
		// console.log(content);
		const reg = new RegExp(Evt.getImageLocalUrlPrefix(), 'g');
		content = content.replace(reg, Evt.leanoteUrl + '/api/file/getImage');

		const reg2 = new RegExp(Evt.getAttachLocalUrlPrefix(), 'g');
		content = content.replace(reg2, Evt.leanoteUrl + '/api/file/getAttach');

		const reg3 = new RegExp(Evt.getAllAttachsLocalUrlPrefix(), 'g');
		content = content.replace(reg3, Evt.leanoteUrl + '/api/file/getAllAttachs');

		return content;
	},

	// 远程修改本地内容
	updateNoteContentForce: function (noteId, content, callback) {
		const me = this;
		// 修复内容, 修改图片, 附件链接为本地链接
		content = me.fixNoteContent(content);
		db.notes.update({NoteId: noteId}, {
			$set: {
				Err: '',
				Content: content,
				InitSync: false,
				IsContentDirty: false
			}
		}, {}, function (err, numReplaced) {
			if (err) {
				log(err);
				callback && callback(false);
			} else {
				callback && callback(content);
			}
		});

		// 添加到历史中
		me.addNoteHistory(noteId, content);
	},

	// sync调用, 用于判断是否真的有冲突
	// 从服务器上获取内容
	getNoteContentFromServer: function (serverNoteId, callback) {
		const me = this;
		if (!serverNoteId) {
			callback(false);
			return;
		}
		if (!Api) {
			Api = require('./api');
		}
		Api.getNoteContent(serverNoteId, function (noteContent) {
			// 同步到本地
			if (Common.isOk(noteContent)) {
				const content = me.fixNoteContent(noteContent.Content);
				callback(content);
			} else {
				callback(false);
			}
		});
	},

	// 得到笔记内容
	// noteId是本地Id
	inSyncContent: {}, // 正在同步中的
	inSyncTimes: {}, // 10次就要再尝试了
	getNoteContent: function (noteId, callback) {
		const me = this;
		// console.trace('getNoteContent------' + noteId);
		// 如果是正在sync的话, 返回
		/*
		if(me.inSyncContent[noteId]) {
			console.log('in sync now' + noteId); // 下周分享 node-webkit
			return;
		}
		*/
		me.inSyncContent[noteId] = true;
		if (!me.inSyncTimes[noteId]) {
			me.inSyncTimes[noteId] = 0
		}
		me.inSyncTimes[noteId]++;
		if (me.inSyncTimes[noteId] >= 5) {
			return callback && callback(false);
		}

		me.getNote(noteId, function (note) {

			if (!Common.isOk(note)) {
				me.inSyncContent[noteId] = false;
				console.log('not ok');
				console.log(note);
				callback && callback(false);
			} else {
				// 如果笔记是刚同步过来的, 那么内容要重新获取
				if (note.InitSync) {
					console.log('need load from server');

					if (!Api) {
						Api = require('./api')
					}

					const serverNoteId = note.ServerNoteId;

					// 远程获取
					// me.getServerNoteIdByNoteId(noteId, function(serverNoteId) {
					if (!serverNoteId) {
						console.error(noteId + ' getServerNoteIdByNoteId error');
						me.inSyncContent[noteId] = false;
						return callback && callback(false);
					}

					Api.getNoteContent(serverNoteId, function (noteContent, ret) {
						me.inSyncContent[noteId] = false;

						// 同步到本地
						if (Common.isOk(noteContent)) {
							me.updateNoteContentForce(noteId, noteContent.Content, function (content) {
								noteContent.Content = content;
								noteContent.NoteId = noteId;
								callback && callback(noteContent);
							});
						} else {
							// 没有登录或者需要升级
							try {
								if (ret.Ok === false) { // {"Ok":false,"Msg":"NOTLOGIN"}
									console.error(ret)
									return callback && callback(false)
								}
							} catch (e) {
							}
							console.error(noteId + ' api.getNoteContent error');

							// 这里, 可能太多的要同步了
							setTimeout(function () {
								me.getNoteContent(noteId, callback);
							}, 500);

							// callback && callback(false);
						}
					});

					// });
				} else {
					me.inSyncContent[noteId] = false;
					// console.log('not need');
					callback && callback(note);
					// Web.alertWeb("NONO");
				}
			}
		});
	},

	//----------------
	// 同步
	//----------------

	getNoteByServerNoteId: function (noteId, callback) {
		const me = this;
		db.notes.find({ServerNoteId: noteId}, function (err, doc) {
			// console.log(doc.length + '...');
			if (doc.length > 1) {
				console.error(doc.length + '. ..');
			}
			// console.log('note length: ' + doc.length + '. ..');
			if (err || !doc || !doc.length) {
				// log('getNoteByServerNoteId 不存在' + noteId);
				callback && callback(false);
			} else {
				doc = doc[0];
				callback && callback(doc);
			}
		});
	},
	getNoteIdByServerNoteId: function (noteId, callback) {
		const me = this;
		db.notes.findOne({ServerNoteId: noteId}, function (err, doc) {
			if (err || !doc) {
				// log('getNoteIdByServerNoteId 不存在' + noteId);
				callback && callback(false);
			} else {
				callback && callback(doc.NoteId);
			}
		});
	},
	getServerNoteIdByNoteId: function (noteId, callback) {
		const me = this;
		db.notes.findOne({NoteId: noteId}, function (err, doc) {
			if (err || !doc) {
				log('getServerNoteIdByNoteId 不存在');
				callback && callback(false);
			} else {
				callback && callback(doc.ServerNoteId);
			}
		});
	},

	// 强制删除
	// TODO 是否真的删除 ?
	// 有可能服务器上删除了是误删 ?
	deleteNoteForce: function (noteId, callback) {
		const me = this;
		me.getNoteByServerNoteId(noteId, function (note) {
			if (!note) {
				callback && callback(false);
				return;
			}

			db.notes.remove({_id: note._id}, function (err, n) {
				if (err) {
					callback && callback(false);
				} else {
					me.deleteNoteAllOthers(note);
					Notebook.reCountNotebookNumberNotes(note.NotebookId);
					callback && callback(true);
				}
			});
		});
	},

	// 添加笔记本, note object
	// note是服务器传过来的, 需要处理下fix
	// NoteId, ServerNoteId, NotebookId(本地的)
	addNoteForce: function (note, callback) {
		const me = this;
		note.InitSync = true; // 刚同步完, 表示content, images, attach没有同步
		note.IsDirty = false;
		note.LocalIsDelete = false;
		// 这里, 悲剧, 一个大BUG, 应该和server端IsTrash一致,
		// 不然同步的时候将IsTrash的笔记同步到非IsTrash, 2015/10/31 fixed 谢谢 3601提供的信息
		// note.IsTrash = false;
		if (typeof note.IsTrash == 'boolean') {
			note.IsTrash = note.IsTrash;
		} else {
			note.IsTrash = false;
		}

		note.ServerNoteId = note.NoteId;
		note.NoteId = Common.objectId();

		note.CreatedTime = Common.goNowToDate(note.CreatedTime);
		note.UpdatedTime = Common.goNowToDate(note.UpdatedTime);

		// 附件操作
		const files = note.Files || [];
		const attachs = [];
		for (let i in files) {
			const file = files[i];
			if (file.IsAttach) { // LocalFileId, FileId
				file.ServerFileId = file.FileId;
				file.FileId = file.ServerFileId; // 弄成一样的, 只是没有Path
				attachs.push(file);
			}
		}
		note.Attachs = attachs;
		delete note['Files'];

		Notebook.getNotebookIdByServerNotebookId(note.NotebookId, function (localNotebookId) {
			note.NotebookId = localNotebookId;
			db.notes.insert(note, function (err, newDoc) {   // Callback is optional
				if (err) {
					console.log(err);
					callback && callback(false);
				} else {
					// console.log("?????????")
					// console.log(note);
					// console.log(note.CreatedTime);
					callback && callback(newDoc);

					// 添加到历史中
					// 因为没有内容, 所以不用添加
					// me.addNoteHistory(note.NoteId, note.Content);

					// 重新统计
					Notebook.reCountNotebookNumberNotes(note.NotebookId);

					// 下载内容, 图片, 附件
					// 添加时不要, 这个请求由前端发出
					// me.syncContentAndImagesAndAttachs(newDoc, 2000);
				}
			});
		});
	},

	// send change后, 发现内容是一样的, 此时修改本地Usn和server的一样, 下次再push
	updateNoteUsn: function (noteId, usn) {
		db.notes.update({NoteId: note.NoteId}, {$set: {Usn: usn, IsDirty: true}});
	},

	// sync <- 时
	// 更新笔记, 合并之, 内容要重新获取
	// note是服务器传过来的, 需要处理下fix
	// note.NoteId是服务器的
	// needReloadContent 内容是否需要重新加载, 如果处理冲突没有冲突, 已有内容, 不用更新, 只是把其它的覆盖
	updateNoteForce: function (note, callback, needReloadContent) {
		const me = this;

		if (needReloadContent === undefined) {
			needReloadContent = true;
		}

		// console.log('...', JSON.stringify(note))

		note.IsDirty = false;
		note.InitSync = needReloadContent;
		note.LocalIsNew = false;
		note.LocalIsDelete = false;
		note.ContentIsDirty = false;

		// 附件处理
		const files = note.Files || [];
		const attachsMap = [];
		for (let i in files) {
			const file = files[i];
			if (file.IsAttach) { // LocalFileId, FileId
				// 对于服务器上的, 只有FileId会传过来, 此时要与之前的做对比
				file.ServerFileId = file.FileId;
				delete file['FileId'];
				attachsMap[file.ServerFileId] = file;
			}
		}

		// 之前也是有attachs的, 得到之前的attachs, 进行个merge
		// TODO, 这里, 如果serverNoteId有两个一样的, 就有问题了, 待重现
		me.getNoteByServerNoteId(note.NoteId, function (everNote) {
			if (!everNote) {
				return;
			}
			const everAttachs = everNote.Attachs;
			const everAttachsMap = {};

			// var needAdds = [];
			// 得到要删除的
			const needDeletes = [];
			for (let i in everAttachs) {
				const everAttach = everAttachs[i];
				everAttachsMap[everAttach.ServerFileId] = everAttach;
				if (!attachsMap[everAttach.ServerFileId]) {
					needDeletes.push(everAttach);
				}
			}
			// console.log('everAttachs');
			// console.log(everAttachs);
			// console.log('attachsMap')
			// console.log(attachsMap);
			// 通过FileId删除文件
			me.deleteAttachs(needDeletes);

			// 得到要添加的,所有的
			// 新添加的没有Path
			const allAttachs = [];
			for (let serverFileId in attachsMap) {
				if (!everAttachsMap[serverFileId]) {
					// needAdds.push(attachMap[serverFileId]);
					attachsMap[serverFileId].FileId = serverFileId; // 生成一个Id(一样的), 但是没有Path
					allAttachs.push(attachsMap[serverFileId]);
				} else {
					allAttachs.push(everAttachsMap[serverFileId]);
				}
			}
			// console.log('allAttachs', allAttachs);
			note.Attachs = allAttachs;

			note.ServerNoteId = note.NoteId;
			note.NoteId = everNote.NoteId;
			delete note['Files'];
			// console.log('evernote');
			// console.log(everNote);

			// 得到本地笔记本Id
			Notebook.getNotebookIdByServerNotebookId(note.NotebookId, function (localNotebookId) {
				note['NotebookId'] = localNotebookId;

				// console.log("updateNoteForce 后的")
				// console.log(note);
				// console.log(note.ServerNoteId + " " + note.IsDirty);

				// console.log('ever note');
				// console.log(everNote.NoteId);
				// console.log(everNote);

				// 不要服务器上的
				delete note['UpdatedTime'];
				delete note['CreatedTime'];
				note.Err = '';

				db.notes.update({NoteId: note.NoteId}, {$set: note}, {}, function (err, cnt) { // Callback is optional
					// console.log('re:');
					// console.log(err);
					// console.log(cnt);

					if (err) {
						console.error(err);
						callback && callback(false);
					} else {
						console.log('	强制更新本地笔记...', note.Title);
						callback && callback(note);

						/*
						me.getNoteByServerNoteId(note.ServerNoteId, function(t) {
							console.log('强制更新后的...');
							console.log(t);
						});
						*/

						// 重新统计之
						Notebook.reCountNotebookNumberNotes(note.NotebookId);

						// 下载内容, 图片, 附件
						// console.log('..', note)
						// console.log(JSON.stringify(note), note.Attachs)
						me.syncContentAndImagesAndAttachs(note);
					}
				});
			});
		});
	},

	// addNote, updateNote后的操作
	// 添加修改ServerNoteId; 更新修改usn
	// note是服务器传来的, note.NoteId, note.ServerNoteId已设置正确, note.NotebookId是服务器上的
	updateNoteForceForSendChange: function (note, isAdd, callback) {
		const me = this;
		note.IsDirty = false;
		note.InitSync = false;
		note.LocalIsNew = false;
		note.ContentIsDirty = false;
		// note.LocalIsDelete = false;
		// note.UserId = User.getCurActiveUserId();
		//
		// console.log("	updateNoteForceForSendChange", note);

		// 如果是添加的, 因为不会传内容
		// if(isAdd) {
		delete note['Content'];
		// }

		delete note['NotebookId']; // 不要设置notebookId, 2/16 fixed

		// console.log('server data from::::');
		// console.log(note.NoteId);
		// console.log(note.Files);

		// 修改Imags的LocalFileId <=> FileId的映射
		File.updateImageForce(note.Files);

		// 修改attach, 建立LocalFileId <=> FileId的映射
		const files = note.Files || [];
		const filesMap = {}; // LocalFileId => ServerFileId
		for (let i in files) {
			const file = files[i];
			if (file.IsAttach) { // LocalFileId, FileId
				filesMap[file.LocalFileId] = file.FileId;
			}
		}
		// 之前也是有attachs的, 得到之前的attachs, 进行个merge
		me.getNote(note.NoteId, function (everNote) {
			if (!everNote) {
				console.log('	没有?' + note.NoteId);
				return;
			}
			const everAttachs = everNote.Attachs || [];
			for (let i in everAttachs) {
				const everAttach = everAttachs[i];
				if (filesMap[everAttach.FileId]) {
					everAttach.ServerFileId = filesMap[everAttach.FileId];
					everAttach.IsDirty = false; // 不为dirty了, 记得在sync后也改为false
				}
			}
			note.Attachs = everAttachs;
			console.log('	fix after', everAttachs);

			delete note['Files'];
			delete note['UpdatedTime'];
			delete note['CreatedTime'];
			note.Err = '';

			// multi: true, 避免有历史的笔记有问题
			db.notes.update({NoteId: note.NoteId}, {$set: note}, {multi: true}, function (err, n) {
				if (err || !n) {
					console.log('	updateNoteForceForSendChange err', err);
					return callback && callback(false);
				}
				return callback && callback(true);
			});

		});
	},

	// 服务器上的数据
	// 为冲突更新, note已有有NoteId, ServerNoteId, 但NotebookId是服务器端的
	updateNoteForceForConflict: function (note, callback) {
		const me = this;
		note.NoteId = note.ServerNoteId;
		me.updateNoteForce(note, callback);
		return;

		note.IsDirty = false;
		note.InitSync = true;
		note.LocalIsNew = false;
		note.LocalIsDelete = false;
		// 文件操作

		Notebook.getNotebookIdByServerNotebookId(note.NotebookId, function (localNotebookId) {
			note['NotebookId'] = localNotebookId;
			db.notes.update({NoteId: note.NoteId}, {$set: note}, {}, function (err, cnt) {   // Callback is optional
				if (err) {
					console.log(err);
					callback && callback(false);
				} else {
					log('强制更新...');
					callback && callback(note);
				}
			});
		});
	},

	// 将本地冲突的笔记复制一份
	// serverNoteId
	// 附件也要复制一份
	copyNoteForConfict: function (noteId, callback) {
		const me = this;
		me.getNote(noteId, function (note) {
			if (!note) {
				callback(false);
				return;
			}
			// 新Id
			delete note['_id'];
			delete note['ServerNoteId'];
			note.NoteId = Common.objectId(); // 新生成一个NoteId
			note.ConflictNoteId = noteId; // 与noteId有冲突
			note.ConflictTime = new Date(); // 发生冲突时间
			note.ConflictFixed = false; // 冲突未解决
			note.IsDirty = true;
			note.LocalIsNew = true; // 新增加的
			note.InitSync = false; // 都是本地的, 相当于新建的笔记
			note.LocalIsDelete = false;

			// 只复制有path的
			const attachs = note.Attachs || [];
			const newAttachs = [];
			// console.log('不会吧.............')
			// console.log(attachs);
			async.eachSeries(attachs, function (attach, cb) {
				if (!attach.Path) {
					return cb();
				}
				// 新路径
				const filePathAttr = Common.splitFile(attach.Path);
				filePathAttr.nameNotExt += '_cp_' + attach.FileId; // 另一个
				const newPath = filePathAttr.getFullPath();
				console.log('	复制文件', attach);
				// 复制之
				// try {
				Common.copyFile(attach.Path, newPath, function (ret) {
					if (ret) {
						attach.FileId = Common.objectId();
						attach.IsDirty = true;
						attach.Path = newPath;
						delete attach['ServerFileId'];
						newAttachs.push(attach);
					}
					cb();
				});
				/*
            } catch(e) {
                cb();
            }
            */
			}, function () {
				note.Attachs = newAttachs;
				console.log('	conflict 复制后的', note);
				db.notes.insert(note, function (err, newNote) {
					if (err) {
						callback(false);

					} else {
						callback(newNote);
						// 重新统计笔记本的笔记数量
						Notebook.reCountNotebookNumberNotes(newNote.NotebookId);
					}
				});
			});
		});
	},

	// 复制笔记到某笔记本下, 本地使用
	copyNote: function (noteIds, notebookId, callback) {
		const me = this;
		const newNotes = [];
		if (Common.isEmpty(noteIds)) {
			callback(false);
			return;
		}
		async.eachSeries(noteIds, function (noteId, cbTop) {
			me._copyNote(noteId, notebookId, function (newNote) {
				newNotes.push(newNote);
				cbTop();
			});
		}, function () {
			// 重新统计下
			Notebook.reCountNotebookNumberNotes(notebookId);
			callback(newNotes);
		});
	},

	// 复制单个笔记
	_copyNote: function (noteId, notebookId, callback) {
		const me = this;
		me.getNote(noteId, function (note) {
			if (!note) {
				callback(false);
				return;
			}
			// 新Id
			delete note['_id'];
			delete note['ServerNoteId'];
			note.NoteId = Common.objectId();
			note.IsDirty = true;
			note.LocalIsNew = true; // 新增加的
			note.InitSync = false; // 都是本地的, 相当于新建的笔记
			note.LocalIsDelete = false;
			note.IsTrash = false;
			note.NotebookId = notebookId;

			// 只复制有path的
			const attachs = note.Attachs || [];
			const newAttachs = [];
			async.eachSeries(attachs, function (attach, cb) {
				if (!attach.Path) {
					return cb();
				}
				// 新路径
				const filePathAttr = Common.splitFile(attach.Path);
				filePathAttr.nameNotExt += '_cp_' + attach.FileId; // 另一个
				const newPath = filePathAttr.getFullPath();
				// 复制之
				// try {
				Common.copyFile(attach.Path, newPath, function (ret) {
					if (ret) {
						attach.FileId = Common.objectId();
						attach.IsDirty = true;
						attach.Path = newPath;
						delete attach['ServerFileId'];
						newAttachs.push(attach);
					}
					cb();
				});
				/*
            } catch(e) {
                cb();
            }
            */
			}, function () {
				note.Attachs = newAttachs;
				// console.log('conflict 复制后的');
				// console.log(note.Attachs);
				db.notes.insert(note, function (err, newNote) {
					if (err) {
						callback(false);
					} else {
						callback(newNote);
						// 重新统计下
					}
				});
			});
		});
	},

	// 处理冲突
	// notes是服务器的数据, 与本地的有冲突
	// 1) 将本地的note复制一份
	// 2) 服务器替换之前
	fixConflicts: function (noteSyncInfo, callback) {
		const me = this;

		let conflictNotes = noteSyncInfo.conflicts;
		if (!isEmpty(conflictNotes)) {
			console.log('	fix note conflicts', conflictNotes);
		}
		// 这里为什么要同步? 因为fixConflicts后要进行send changes, 这些有冲突的不能发送changes
		conflictNotes || (conflictNotes = []);
		if (!Api) {
			Api = require('./api')
		}
		async.eachSeries(conflictNotes, function (serverAndLocalNote, cb) {
			// var noteId = note.NoteId; // 本地noteId
			// 复制一份, 本地的复制一份, 然后服务器上的替换本地的
			// newNote其实是现有的复制一份得到的

			// TODO, 这里, 如果内容是一样的, 则以服务器上的版为准

			// console.error('是否真的冲突');
			const serverNote = serverAndLocalNote.server; // noteId没有转换的
			const localNote = serverAndLocalNote.local; // 本地的note

			Api.getNoteContent(serverNote.NoteId, function (noteContent) {
				// 同步到本地
				if (Common.isOk(noteContent)) {
					const serverContent = me.fixNoteContent(noteContent.Content); // 图片, 附件的链接
					// var serverContent = noteContent.Content; // 图片, 附件的链接

					// console.error(serverContent);
					// console.error(localNote.Content);

					// 没有冲突, 好, 用服务器端的其它值
					if (serverContent === localNote.Content) {
						// console.error(localNote.Title + ' 无冲突');
						// console.log(serverNote);
						delete serverNote['Content'];
						delete serverNote['Abstract'];
						delete serverNote['Desc'];
						me.updateNoteForce(serverNote, function (updatedNote) {
							// 作为更新
							noteSyncInfo.updates.push(updatedNote);
							cb();
						}, false);
					}

						// 不行, 冲突了, 复制一份
					// TODO 用新的Content, 不要再去取了
					else {
						me.copyNoteForConfict(localNote.NoteId, function (newNote) {
							if (newNote) {
								// 更新之前的
								serverNote.ServerNoteId = serverNote.NoteId;
								serverNote.NoteId = localNote.NoteId;
								me.updateNoteForceForConflict(serverNote, function (note2) {
									if (note2) {
										// 前端来处理, 全量sync时不用前端一个个处理
										Web.fixSyncConflictNote(note2, newNote);
									}
									cb();
								});
							} else {
								cb();
							}
						});
					}
				}
			});

		}, function () {
			// 最后调用
			callback && callback();

			// 因为在处理冲突的时候有些成为更新了, 所以必须在此之后调用
			// console.log('has updates...');
			// console.log(noteSyncInfo.updates);
		});

		// 发送改变的冲突
		// 复制一份
		// 发送改变的冲突, 有这种情况发生吗?
		const changeConflicts = noteSyncInfo.changeConflicts;
		// console.log('changeConflicts');
		// console.log(changeConflicts);
		for (var i in changeConflicts) {
			(function (i) {

				const note = changeConflicts[i]; // note是本地的note
				// 复制一份
				me.copyNoteForConfict(note.NoteId, function (newNote) {
					if (newNote) {
						// 更新之前的, 要先从服务器上得到服务版的
						// 这里的note是本地的, 所以将服务器上的覆盖它
						if (!Api) {
							Api = require('./api');
						}
						Api.getNote(note.ServerNoteId, function (serverNote) {
							serverNote.ServerNoteId = serverNote.NoteId;
							serverNote.NoteId = note.NoteId;
							// console.error("changeConflicts -> get note from server");
							// console.log(serverNote);
							// console.log(note);
							me.updateNoteForceForConflict(serverNote, function (note2) {
								if (!note2) {
									// 前端来处理, 全量sync时不用前端一个个处理
									Web.fixSyncConflict(note2, newNote);
								}
							});
						});
					} else {
					}
				});

			})(i);
		}

		// errors
		Web.updateErrors(noteSyncInfo.errors);

		// 1. pull
		// 更新的
		if (!Common.isEmpty(noteSyncInfo.updates)) {
			Web.updateSyncNote(noteSyncInfo.updates);
		}
		// 处理添加的
		const addNotes = noteSyncInfo.adds;
		if (!isEmpty(addNotes)) {
			console.log('	has add note...', addNotes);
			Web.addSyncNote(addNotes);
		}
		// 处理删除的
		Web.deleteSyncNote(noteSyncInfo.deletes);


		// 2. push

		// 处理添加的
		if (!Common.isEmpty(noteSyncInfo.changeAdds)) {
			Web.updateChangeAdds(noteSyncInfo.changeAdds);
		}

		// 处理更新的
		if (!Common.isEmpty(noteSyncInfo.changeUpdates)) {
			Web.updateChangeUpdates(noteSyncInfo.changeUpdates);
		}

		// 服务器没有, 但是是发送更新的, 所以需要作为添加以后再send changes
		if (noteSyncInfo.changeNeedAdds) {
			const needAddNotes = noteSyncInfo.changeNeedAdds;
			for (var i in needAddNotes) {
				console.log('	need add note');
				var note = needAddNotes[i];
				me.setIsNew(note.NoteId);
			}
		}

		// 为了博客
		let changeAdds = noteSyncInfo.changeAdds || [];
		const changeUpdates = noteSyncInfo.changeUpdates || [];
		changeAdds = changeAdds.concat(changeUpdates);
		Web.updateNoteCacheForServer(changeAdds);
	},

	// 得到所有文件要传的基本信息和传送的数据
	getFilesPostInfo: function (files, callback) {
		const needPostFilesAttr = [];
		const needTransferFiles = {};
		if (!files || files.length === 0) {
			return callback(needPostFilesAttr, needTransferFiles);
		}

		async.eachSeries(files, function (file, cb) {
			// var file = files[i];
			const needFile = {
				FileId: file.ServerFileId,
				LocalFileId: file.FileId,
				Type: file.Type,
				HasBody: false,
				IsAttach: file.IsAttach,
			};

			// console.log(file);
			// 要传数据的
			if (file.IsDirty) {
				// TODO
				if (file.Path.indexOf('data/') === 0) {
					file.Path = Evt.getAbsolutePath(file.Path);
				}
				fs.exists(file.Path, function (isExists) {
					if (isExists) {
						needTransferFiles[file.FileId] = {
							file: file.Path,
							content_type: 'application/' + file.Type // TODO
						}
						if (file.Title) {
							needTransferFiles[file.FileId].filename = file.Title;
						}
						needFile.HasBody = true;
						needPostFilesAttr.push(needFile);
					}
					return cb();
				});
			} else {
				needPostFilesAttr.push(needFile);
				return cb();
			}
		}, function () {
			callback(needPostFilesAttr, needTransferFiles);
		});
	},

	// 获得用户修改的笔记
	getDirtyNotes: function (callback) {
		const me = this;
		db.notes.find({UserId: User.getCurActiveUserId(), IsDirty: true}, function (err, notes) {
			if (err) {
				log(err);
				return callback && callback(false);
			} else {
				// 每一个笔记得到图片, 附件信息和数据
				async.eachSeries(notes, function (note, cb) {
					//  LocalContent 留作副本, 用于冲突判断
					note.LocalContent = note.Content;

					note.Content = me.fixContentUrl(note.Content);
					me.getNoteFiles(note, function (files) {
						note.Content = me.fixNoteContentForSend(note.Content);
						// note.Files = files || [];
						me.getFilesPostInfo(files, function (attrs, fileDatas) {
							note.Files = attrs;
							note.FileDatas = fileDatas;
							cb();
						});
					});
				}, function () {
					callback(notes);
				});
			}
		});
	},

	// 历史原因, 支持了protocol, 但url还是有127
	fixContentUrl: function (content) {
		if (!content) {
			return content;
		}
		if (Evt.canUseProtocol()) {
			return content.replace(/http:\/\/127.0.0.1:8912\/api\//g, 'leanote://');
		}
	},

	// 得到笔记的文件
	getNoteFiles: function (note, callback) {
		const noteId = note.NoteId;
		// 先处理内容URL
		const content = note.Content;

		// 1. 先得到附件
		let attachs = note.Attachs || [];
		for (let i in attachs) {
			const attach = attachs[i];
			attach.IsAttach = true;
		}

		// 1. 先得到图片

		// 得到图片信息, 通过内容
		// http://localhost:8002/api/file/getImage?fileId=xxxxxx, 得到fileId, 查询数据库, 得到图片
		// console.log(content);
		// console.log(Evt.localUrl + '/api/file/getImage?fileId=([0-9a-zA-Z]{24})');
		// var reg = new RegExp(Evt.localUrl + "/api/file/getImage\\?fileId=([0-9a-zA-Z]{24})", 'g');
		const reg = new RegExp(Evt.getImageLocalUrlPrefix() + "\\?fileId=([0-9a-zA-Z]{24})", 'g');
		const fileIds = [];
		// var fileIdsMap = {}; // 防止多个
		while ((result = reg.exec(content)) != null) {
			// result = [所有, 子表达式1, 子表达式2]
			if (result && result.length > 1) {
				// console.log(result);
				const fileId = result[1];
				fileIds.push(fileId);
			}
		}
		const files = []; // {localFileId: "must", fileId: "", hasBody: true, filename: "xx.png"}
		if (fileIds.length > 0) {
			// 得到所有的图片
			File.getAllImages(fileIds, function (images) {
				// attach与图片结合
				if (images) {
					attachs = attachs.concat(images);
				}
				callback(attachs);
			});
		} else {
			callback(attachs);
		}
	},

	// 在send delete笔记时成功
	setNotDirty: function (noteId) {
		db.notes.update({NoteId: noteId}, {$set: {IsDirty: false}})
	},
	removeNote: function (noteId) {
		db.notes.remove({NoteId: noteId});
	},
	// 在send delete笔记时有冲突, 设为不删除
	setNotDirtyNotDelete: function (noteId) {
		db.notes.update({NoteId: noteId}, {$set: {IsDirty: false, LocalIsDelete: false}})
	},
	setIsNew: function (noteId) {
		db.notes.update({NoteId: noteId}, {$set: {LocalIsNew: true, IsDirty: true}})
	},

	//----------------------------------
	// Attach
	// 有部分操作放在File中了,
	// 也有attach表, 但只作添加/删除附件用
	//

	// 更新笔记的附件
	// web只要一个添加了, 删除的, 全部更新
	updateAttach: function (noteId, attachs) {
		const me = this;
		console.log('updateAttach');
		console.log(attachs);

		// 删除修改了的
		me.deleteNotExistsAttach(noteId, attachs, function () {
			// 一个坑!!!!!!!!!!!, js是引用的, needb并不会立即写到硬盘上, 在内存中是一个引用
			const t = [];
			for (let i in attachs) {
				t.push(attachs[i]);
			}
			db.notes.update({NoteId: noteId}, {$set: {Attachs: t, IsDirty: true, UpdatedTime: new Date()}});
		});
	},

	// web端操作, 删除attach时, 删除不要的attach
	deleteNotExistsAttach: function (noteId, attachs, callback) {
		const me = this;
		// console.log('--');
		me.getNote(noteId, function (note) {
			if (!note) {
				callback();
				return;
			}
			const everAttachs = note.Attachs || [];
			const nowMap = {};
			for (var i in attachs) {
				nowMap[attachs[i].FileId] = attachs[i];
			}
			// console.log(note);
			// console.log('end');
			// console.log(everAttachs.length);
			// console.log(attachs.length);
			// console.log(attachs == everAttachs);
			const fileBasePath = User.getCurUserAttachsPath();
			for (var i in everAttachs) {
				const attach = everAttachs[i];
				const path = attach.Path;
				if (!nowMap[attach.FileId]) { // 如果不在, 则删除之
					// console.log(">>>>>>>>>");
					try {
						// 删除源文件, 别删错了啊
						if (path.indexOf(fileBasePath) >= 0) {
							fs.unlink(path, () => {
							});
						}
					} catch (e) {
						console.log(e);
					}
				}
			}

			// 一个坑!!!!!!!!!!!
			callback();
		});
	},

	// 删除图片
	// 删除图片有困难, 如果用户复制了笔记的内容贴到其它笔记中去了
	deleteImages: function (note) {
	},

	// 删除附件, 在sync时
	// 或者, 在删除笔记后
	deleteAttachs: function (attachs) {
		if (!attachs || attachs.length === 0) {
			return;
		}
		const me = this;
		const fileBasePath = User.getCurUserAttachsPath();
		for (let i = 0; i < attachs.length; ++i) {
			const path = attachs[i].Path;
			if (path && path.indexOf(fileBasePath) >= 0) {
				try {
					fs.unlink(path, () => {
					});
				} catch (e) {
					console.error(e);
				}
			}
		}
	},

	// 同步内容, 图片, 附件
	// 异步操作
	// 延迟1s
	syncContentAndImagesAndAttachs: function (note, timeout) {
		const me = this;
		setTimeout(function () {
			// 内容
			console.log("	syncContentAndImagesAndAttachs..... " + note.NoteId);
			me.getNoteContent(note.NoteId, function (noteAndContent) {
				if (noteAndContent) {
					console.log('	sync content ' + note.NoteId + ' ok');
					const content = noteAndContent.Content;
					Web.contentSynced(note.NoteId, note.Content);
					// 图片
					if (content) {
						me.syncImages(content);
					}
				} else {
					// Web.alertWeb(note.NoteId + ' ' + note.Title  + ' getContent error!!');
				}
			});

			// 附件
			const attachs = note.Attachs || [];
			for (let i = 0; i < attachs.length; ++i) {
				const attach = attachs[i];
				me.downloadAttachFromServer(note.NoteId, attach.ServerFileId, attach.FileId);
			}
		}, timeout || 1000);
	},

	// 同步图片
	inSyncImage: {}, //
	syncImages: function (content) {
		const me = this;
		if (!content) {
			return;
		}

		// 这里, 导致file_main不用调用api_main了, 因为这里会调用api处理

		// console.log('syncImages..................');
		// console.log(content);
		// 得到图片id
		// var reg = new RegExp(Evt.localUrl + "/api/file/getImage\\?fileId=(.{24})\"", 'g');
		const reg = new RegExp(Evt.getImageLocalUrlPrefix() + "\\?fileId=([0-9a-zA-Z]{24})", 'g');
		// var a = 'abdfileId="xxx" alksdjfasdffileId="life"';
		// var reg = /fileId="(.+?)"/g;
		let s;
		// console.log(reg);
		while (s = reg.exec(content)) {
			// console.log(s);
			if (s && s.length >= 2) {
				const fileId = s[1];
				// console.log('sync image: ' + fileId);
				if (!me.inSyncImage[fileId]) {
					me.inSyncImage[fileId] = true;
					File.getImage(fileId, function () {
						me.inSyncImage[fileId] = false;
					});
				}
			}
		}
	},

	/*
	1) sync时判断是否有attach, 如果有, 则异步下载之
	2) 前端render note时, 判断是否有未Path的attach, 调用该服务
	从服务器端下载文件, 并通过到前端已下载完成
	*/
	inDownload: {}, // 正在下载的文件 fileId => true
	downloaded: {}, // 下载完成的
	downloadAttachFromServer: function (noteId, serverFileId, fileId) {
		const me = this;
		console.log('下载中: ' + serverFileId);
		if (me.inDownload[serverFileId] || me.downloaded[serverFileId]) {
			// return;
		}
		if (!Api) {
			Api = require('./api');
		}

		me.inDownload[serverFileId] = true;
		Api.getAttach(serverFileId, function (ok, toPath, filename) {
			me.inDownload[serverFileId] = false;
			if (ok) {
				me.downloaded[serverFileId] = fileId;
				// 更新serverFileId与fileId的映射, 修改的是note
				me.syncAttach(noteId, serverFileId, fileId, toPath, filename, function (ok, attachs, attach) {
					if (ok) {
						// 通知web
						Web.attachSynced(attachs, attach, noteId);
					}
				});
			} else {
				// 下次再下载 ?
				// 或者放到一个队列中 ?
				// TODO
			}
		});
	},

	// 同步附件, 更新serverFileId
	syncAttach: function (noteId, serverFileId, fileId, path, filename, callback) {
		const me = this;
		me.getNote(noteId, function (note) {
			if (!note) {
				callback(false);
			}
			const attachs = note.Attachs;
			for (let i in attachs) {
				const attach = attachs[i];
				if (attach.FileId === fileId) {
					attach.ServerFileId = serverFileId;
					attach.Path = path;
					// attach.Title = filename;
					// attach.Filename = filename;

					db.notes.update({_id: note._id}, {$set: {Attachs: attachs}}, function () {
						callback(true, attachs, attach);
					});
					break;
				}
			}
			callback(false);
		});
	},

	// 根据标签得到笔记数量
	countNoteByTag: function (title, callback) {
		const userId = User.getCurActiveUserId();
		db.notes.count({UserId: userId, LocalIsDelete: false, Tags: {$in: [title]}}, function (err, cnt) {
			callback && callback(cnt);
		});
	},
	// 彻底删除笔记时调用
	updateTagCount: function (tags) {
		const me = this;
		if (!tags) {
			return;
		}
		const tagUpdate = {}; //
		if (!Tag) {
			Tag = require('./tag');
		}

		const userId = User.getCurActiveUserId();
		for (let i in tags) {
			const title = tags[i];
			(function (t) {
				me.countNoteByTag(t, function (cnt) {
					Tag.updateTagCount(t, cnt);
				});
			})(title);
		}
	},

	// 这里,有一个大BUG, 导致全量同步时会修改一些笔记的IsDirty
	// title==null时传过来
	// tag.js调用
	// 删除包含title的笔记
	// 先删除tag, 再删除tag.js
	updateNoteToDeleteTag: function (title, callback) {
		if (!title) {
			return callback({});
		}
		const updates = {}; // noteId =>
		const userId = User.getCurActiveUserId();
		console.log('	updateNoteToDeleteTag', title);
		db.notes.find({UserId: userId, LocalIsDelete: false, Tags: {$in: [title]}}, function (err, notes) {
			console.log('updateNoteToDeleteTag notes', err, title, notes);
			if (!err && notes && notes.length > 0) {
				for (let i = 0; i < notes.length; ++i) {
					const note = notes[i];
					const tags = note.Tags;
					// 删除之
					for (let j = 0; j < tags.length; ++j) {
						if (tags[j] === title) {
							// tags = tags.splice(j, 1); // 之前是这样, 返回的是删除之后的
							tags.splice(j, 1);
							break;
						}
					}
					note.Tags = tags;
					note.IsDirty = true;
					updates[note.NoteId] = note;
					db.notes.update({_id: note._id}, {$set: {Tags: tags, IsDirty: true}}, function (err) {
						// console.log("??");
						// console.log(err);
						callback(updates);
					});
				}
			} else {
				// console.log('updateNoteToDeleteTag');
				// console.log(err);
				callback({});
			}
		});
	},

	exportPdf: function (noteId, callback) {
		const me = this;
		me.getServerNoteIdByNoteId(noteId, function (serverNoteId) {
			if (!serverNoteId) {
				callback({Ok: false, Msg: 'noteNotExists'});
			} else {
				if (!Api) {
					Api = require('./api');
				}
				Api.exportPdf(serverNoteId, callback);
			}
		})
	},

	// 设置笔记同步错误信息
	setError: function (noteId, err, ret, callback) {
		const me = this;
		const Err = {};
		try {
			if (err && typeof err == 'object') {
				Err.err = err.toString();
			}
		} catch (e) {
		}
		if (typeof ret == 'object' && 'Msg' in ret) {
			Err.msg = ret.Msg;
		} else {
			Err.msg = ret + '';
		}

		db.notes.update({NoteId: noteId}, {$set: {Err: msg}}, {}, function (err, numReplaced) {
			return callback && callback(true);
		});
	}
};

module.exports = Note;