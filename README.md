# 物流码（wuliuma · 面板源码）

> 2026-10-23 (v3.4)：**Bundle Id `wuliuma`、Extension Id `wuliuma.combo`、菜单名「物流码」、部署文件夹 `wuliuma`** —— 四处已统一。
> 目录名 2026-10-22 从「条码与整理图片」改来。

**一个 CEP 包，一个面板（两个页签）** —— 这两块功能本来就同属一个 Bundle。  
v2.9 起按用户拍板合并：顶部页签切换「条码生成 / 整理图片」，不再各占一个菜单项。

| 事项        | 值                                                   |
| --------- | --------------------------------------------------- |
| Bundle Id | `wuliuma`                                           |
| 版本        | **3.4.0**                                           |
| 面板        | 菜单名「物流码」· `wuliuma.combo`                          |
| 页签 1      | 条码生成 → `jsx/barcode_generator_panel.jsx`            |
| 页签 2      | 整理图片 → `jsx/organize_images.jsx`（每行数量 + 图片间距都由面板传入） |

建立时间：2026-10-10（从 AppData 部署目录原样复制，8 个文件 SHA256 全部校验一致）  
v2.9：2026-10-12（两面板合并为顶部页签）  
v3.0：2026-10-20（配色同步印前 v11.3 · 方案 A；新增一键安装/卸载脚本）  
v3.1：2026-10-21（整理图片「图片间距」改为可调：默认 5mm / 0~50 / 支持 2.5 这种小数）  
v3.2：2026-10-21（字体不再靠写死的 PostScript 名：候选表全落空时扫 `app.textFonts` 找黑体；设置后回读校验；状态行回显实际字体名）  
v3.3：2026-10-22（v3.2 的宽扫描误命中 `FZBAOHTS--GB1-0` ⇒ 收窄为"只认 FZHTJW / FZHTK"，两个都没有就不生成）
v3.4：2026-10-23（Bundle Id → `wuliuma`、Extension Id → `wuliuma.combo`、菜单名 → 「物流码」；逻辑零改动）

## 目录结构

```
CSXS/manifest.xml                面板清单（v2.9 起只含一条 Extension）
css/panel.css                    共用样式（含 .tabbar/.tab/.pane-off/.num-row）
js/CSInterface.js                CEP 通信库
js/runner.js                     面板逻辑（共用；v2.9 起 setStatus 支持 statusId）
jsx/barcode_generator_panel.jsx  「条码生成」Illustrator 端逻辑（ZW_barcodeGeneratorRun）
jsx/organize_images.jsx          「整理图片」Illustrator 端逻辑（ZW_organizeImagesRun）
panels/panel.html                合并后的唯一界面（页签 + 两个 pane）
tests/barcode-verify.js          自检（219 项，【开发用，不随包分发】）
windows一键安装.bat               安装：复制 5 个目录到 CEP + 开 PlayerDebugMode
windows一键卸载.bat               卸载：删掉 CEP 里的扩展目录
```

## 两个 jsx 的调用形态（别写错）

| jsx                         | 入口                                 | 面板调用方式                                    |
| --------------------------- | ---------------------------------- | ----------------------------------------- |
| barcode_generator_panel.jsx | `ZW_barcodeGeneratorRun(panelCfg)` | `runZWFunction(...)`，返回 `ZW1\|数量\|失败\|文案` |
| organize_images.jsx         | `ZW_organizeImagesRun(panelCfg)`   | `runZWFunction(...)`，v2.9 起同样回协议          |

⚠ v2.9 之前 `organize_images.jsx` 是 `(function(){})()` 自执行、由 `runZWScript` 纯 `evalFile` 调用，  
**收不到任何参数**；要让「每行数量」可调就必须改成具名函数 —— 别再退回自执行写法。

## 部署方法

**双击 `windows一键安装.bat`** 就行。它会：

1. 把 `CSXS` / `css` / `js` / `jsx` / `panels` 五个目录清空重铺到  
   `%APPDATA%\Adobe\CEP\extensions\wuliuma\`  
   （先删后copy —— 改名或删掉的文件不会残留在旧副本里）；
2. 逐个校验 7 个落地文件，缺一个就报 `FAILED` 并打排查提示；
3. 给 `HKCU\Software\Adobe\CSXS.9` ~ `CSXS.16` 写 `PlayerDebugMode=1`（未签名扩展必需）。  
   这一步写不进去只报 WARN、不影响文件，可右键「以管理员身份运行」重试。

⚠ **部署文件夹名 = Bundle Id = `wuliuma`**（CEP 只认 `ExtensionBundleId`，文件夹名本来可以不同，这次统一了）。
⚠ 2026-10-22 部署 folder 从 `com.zw.illustrator.panels` 改名，安装脚本会**自动删掉旧 folder**，否则菜单里会同时出现两个面板。
⚠ 2026-10-23 还改了 **Bundle Id**（`com.zw.illustrator.panels` → `wuliuma`）+ **菜单名**（→「物流码」）：
AI 已保存的工作区里那个旧面板会**变空**，重启后到「窗口 > 扩展功能 > 物流码」重新打开一次即可。
⚠ **`tests/` 与两个 `.bat` 不进扩展目录** —— 安装脚本只发那 5 个目录，别手工把整个文件夹拖进去。
⚠ 装完**重启 Illustrator**，菜单在「窗口 > 扩展功能 > 物流码」。

手工部署（不想用脚本时）：把上面 5 个目录覆盖到同一路径即可，效果等价。

## 卸载

**双击 `windows一键卸载.bat`** —— 删掉 `%APPDATA%\Adobe\CEP\extensions\wuliuma\` 整个目录  
（顺带把改名前的 `com.zw.illustrator.panels\` 也清掉）。

⚠ 卸载**故意不还原** `PlayerDebugMode`：印前检查面板可能还装在同一台机器上，也需要这个开关。  
要彻底关掉就自己删注册表里 `HKCU\Software\Adobe\CSXS.*` 的 `PlayerDebugMode`。

## 字体（v3.3 起：只认两个名字）

条码数字**只用**这两个字体，按顺序取第一个存在的：

1. `FZHTJW--GB1-0` —— 方正黑体简体（首选）
2. `FZHTK--GBK1-0` —— 方正黑体_GBK（次选）

两个都找不到 ⇒ **不生成**，状态行标红并 alert：  
「未找到 方正黑体简体(FZHTJW--GB1-0) 或 方正黑体_GBK(FZHTK--GBK1-0)。按设置不会用其他字体代替，本次未生成。」

- 先用精确 PostScript 名取；没取到时按**族前缀** `FZHTJW` / `FZHTK` 窄扫一遍（防止后缀版本号不同，如 `FZHTJW--GBK1-0`）。
- **不会**用 `SimHei` / `MicrosoftYaHei` / `ArialMT` 或别的方正字体顶替（v3.2 的宽扫描就误命中过 `FZBAOHTS--GB1-0`，已整体废弃）。
- 生成成功后状态行回显实际字体名（`字体 FZHTJW--GB1-0。`）。
- 设置字体后还会**回读** `characterAttributes.textFont.name`，不一致会报「N 个条码的字体未生效」—— 专治"看着设了其实是衬线体"。

## 自检

```
node tests/barcode-verify.js
```

⚠ 它默认读的是**部署目录**（不是源码）。改完源码想先验再部署，得指定：

```
ZW_EXT="D:/workbuddy/包装/wuliuma" node tests/barcode-verify.js
```

反向验证（新断言必须集体 FAIL）：

```
ZW_EXT="…/其他资料文件/backup-barcode-panels/com.zw.illustrator.panels.v3.4.bak" node tests/barcode-verify.js
```

## 回退

| 备份目录                                 | 内容是                  |
| ------------------------------------ | -------------------- |
| `com.zw.illustrator.panels.v3.4.bak` | **v3.3 终态**（最新可用回退点） |
| `com.zw.illustrator.panels.v3.2.bak` | v3.1 终态 |
| `com.zw.illustrator.panels.v3.1.bak` | v3.0 终态              |
| `com.zw.illustrator.panels.v3.0.bak` | v2.9 终态              |

⚠ 备份名 = "改它之前那一刻"，不是目标版本，别按名字反推。  
⚠ `v3.2` 的终态**没有单独备份**（那轮漏了），而且 v3.2 的宽扫描本身有 bug，不建议回退到它。  
回退 = 把备份目录里的 8 个文件覆盖回源码目录（或直接覆盖到 CEP 目录）→ 版本号改回对应值 → 重启 Illustrator。
