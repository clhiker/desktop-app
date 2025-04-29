// preload.js
const { contextBridge } = require('electron');
const { app } = require('@electron/remote');

// 将主进程的 getLocale 方法安全暴露给渲染进程
contextBridge.exposeInMainWorld('api', {
    getLocale: () => app.getLocale()
});
