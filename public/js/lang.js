// const { app:lang_app } = require('@electron/remote');
const fs = require('fs');
const lang = {
	readJson: function (file) {
		try {
			const data = fs.readFileSync(__dirname + '/' + file, 'utf-8');
			return JSON.parse(data);
		} catch (e) {
			console.log(e);
			return false;
		}
	},
	// 读取语言, 修改html
	init: function () {
		const me = this;
		const defaultLang = 'en-us';

		let sysLang = app.getLocale();
		if (sysLang) {
			sysLang = sysLang.toLowerCase();
		}

		const curLang = Config['lang'] || sysLang || defaultLang;
		let langData = me.readJson('public/langs/' + curLang + '.js');
		if (!langData) {
			langData = me.readJson('public/langs/' + defaultLang + '.js');
			if (!langData) {
				return;
			}
		}
		// 设为全局
		window.curLang = curLang;
		window.langData = langData;

		$('body').addClass('lang-' + curLang);

		me.renderHtml();
	},

	// 将当前的html重新渲染
	renderHtml: function () {
		const me = this;
		$('.lang').each(function () {
			const $this = $(this);
			const txt = $.trim($this.text());
			if (langData[txt] !== undefined) {
				$this.html(langData[txt]);
			}
		});
		$('.lang-placeholder').each(function () {
			const $this = $(this);
			const txt = $.trim($this.attr('placeholder'));
			if (langData[txt] !== undefined) {
				$this.attr('placeholder', langData[txt]);
			}
		});

		$('.lang-title').each(function () {
			const $this = $(this);
			const txt = $.trim($this.attr('title'));
			if (langData[txt] !== undefined) {
				$this.attr('title', langData[txt]);
			}
		});
	}
};

lang.init();
