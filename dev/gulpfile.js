const fs = require('fs');
const path = require('path');
const gulp = require('gulp');
const log = require('gulplog');
const less = require('gulp-less');
const cleanCSS = require('gulp-clean-css');

const styleDir = '../public/themes';
const styleDir2 = '../public/css';

// 核心任务：LESS编译与压缩
function processLess() {
    return gulp.src([`${styleDir}/**/*.less`, `${styleDir2}/**/*.less`])
        .pipe(less())
        .on('error', log.error) // 添加错误监听[1,7](@ref)
        .pipe(cleanCSS({
            compatibility: 'ie8',
            processImportFrom: ['!icon/iconfont.css', '!inhope-icon/style.css']
        }))
        .pipe(gulp.dest(file => file.base)) // 动态输出到源目录[2](@ref)
        .on('end', () => log.info('LESS编译完成'));
}

// 开发监视任务
function watchFiles() {
    gulp.watch([`${styleDir}/**/*.less`, `${styleDir2}/**/*.less`], processLess);
}

// 新版任务组合方式[1,6,8](@ref)
const dev = gulp.series(
    processLess,      // 先执行编译
    watchFiles        // 再启动监听
);

// 新版导出方式[3,6](@ref)
exports.less = processLess;
exports.dev = dev;
exports.default = dev; // 默认任务指向开发模式