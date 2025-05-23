/*
require.config({
    baseUrl: 'public'
});
*/
(function() {
    const plugins = Config.plugins || [];
    if(plugins.length === 0) {
        initPage();
        return;
    }
    const pluginPaths = [];
    for(let i = 0; i < plugins.length; ++i) {
        pluginPaths.push('public/plugins/' + plugins[i] + '/plugin');
    }
    
    require(pluginPaths, function() {
        const ps = arguments;
        // open前
        for(var i = 0; i < ps.length; ++i) {
            var plugin = ps[i];

            // 添加语言包
            Api.addLangMsgs(plugin.langs, 'plugin.' + plugins[i]);

            plugin['onOpen'] && plugin['onOpen'].call(plugin);
        }

        // initOpen();
        initPage(function() { 
            // open后
            for(let i = 0; i < ps.length; ++i) {
                const plugin = ps[i];
                plugin['onOpenAfter'] && plugin['onOpenAfter'].call(plugin);
            }
        });
    });
})();