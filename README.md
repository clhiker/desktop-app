# Leanote Desktop App

[![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/leanote/desktop-app?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

Use Electron(atom-shell) to create leanote desktop app.

![preview.png](preview.png "")

## Download
Please see http://app.leanote.com

## How to develop it

### 1. Install Electron v12.0.2

See https://github.com/electron/electron/releases/tag/v12.0.2


### 2. Run it with electron

Download this project, and run

```shell
# 1. install dependencies
$> cd PATH-TO-LEANOTE-DESKTOP-APP
$> npm i

# 2. use gulp to parse less
$> cd PATH-TO-LEANOTE-DESKTOP-APP/dev
$> npm i
$> gulp dev

# 3. run with electron
$> cd PATH-TO-LEANOTE-DESKTOP-APP
$> electron .
```

## Docs

Please see https://github.com/leanote/desktop-app/wiki


## LICENSE

[LICENSE](https://github.com/leanote/desktop-app/blob/master/LICENSE)

```
LEANOTE - NOT JUST A NOTEPAD!

Copyright by the contributors.

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

Leanote destop app is licensed under the GPL v2.
```

Todo List

1. [x] 更新代码引用库到最新版本，修复依赖报错
2. [ ] 文件夹导入导出功能
   - [x] 导出保存目录结构，包括顶层目录和子目录
   - [ ] 导入保存原结构
3. [ ] 高级搜索功能
   - [ ] 标题搜索
   - [ ] 全文搜索
4. [ ] 界面美化
   - [ ] 自定义边栏壁纸
   - [ ] 使用时下更流行的配色和字体
   - [ ] 侧边栏文件夹美化
   ... 
5. [ ] MarkDown 升级
   - [ ] 升级实时渲染的markdown 工具
   - [ ] 增加图床
   - [ ] markdown 自动补全功能 
- [ ] ... 其他的等我想到了再写