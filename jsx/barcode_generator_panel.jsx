#target illustrator
function ZW_barcodeGeneratorRun(panelCfg) {
    panelCfg = panelCfg || {};

    // 2026-09-11 (v2.3): 结果协议。返回值固定为 ZW1|生成数量|业务失败0/1|展示文案,
    // 前端(js/runner.js)读前两个字段判断"生成几个/是否失败", 不再去正则匹配下面
    // 那些给用户看的句子——否则哪天改一句文案, 前端的"累计生成"和"失败标红"就会静默失效。
    function zwsResult(count, isError, text) {
        return "ZW1|" + count + "|" + (isError ? 1 : 0) + "|" + text;
    }

    // =====================================================
    // 检查文档
    // =====================================================
    if (app.documents.length === 0) {
        alert("请先打开一个 Illustrator 文档。");
        return zwsResult(0, true, "请先打开一个 Illustrator 文档。"); // 业务失败 → 前端标红
    }

    var doc = app.activeDocument;
    var outlineText = panelCfg.outlineText !== false;
    var keepBackground = panelCfg.keepBackground !== false;
    var rawInput = String(panelCfg.codes || "");
    // =====================================================
    // 数据清洗
    // =====================================================
    var rawLines = rawInput.split(/[\r\n]+/);

    var codeList = [];
    var badLines = []; // 2026-09-11: 含非法字符的行(旧版会把字符静默抹掉)

    for (var i = 0; i < rawLines.length; i++) {

        var code = rawLines[i];

        // 去除首尾空格
        code = code.replace(/^\s+|\s+$/g, "");

        if (code.length === 0) {
            continue;
        }

        // 2026-09-11 修复: 旧版这里用 code.replace(/[^\x20-\x7E]/g, "") 把中文、
        // 全角字符悄悄删掉——粘贴 "AB中C" 会生成 "ABC" 的条码(与实际编码不符)
        // 且没有任何提示,印出来才发现。现在检出即跳过该行并回报:
        // 宁可不出,不出错。
        if (/[^\x20-\x7E]/.test(code)) {
            badLines.push({ line: i + 1, code: code });
            continue;
        }

        codeList.push(code);
    }

    if (codeList.length === 0) {
        alert("没有检测到有效编码。" +
            (badLines.length > 0
                ? "\n以下行含非法字符(仅支持半角英文/数字/符号): " + badLinesText(badLines)
                : ""));
        return zwsResult(0, true, "没有检测到有效编码。" +
            (badLines.length > 0
                ? " 含非法字符的行: " + badLinesText(badLines)
                : ""));
    }

    // 非法字符行摘要(最多列 3 行): "第 2 行「AB中C」、第 5 行「１２３」"
    function badLinesText(list) {
        if (!list || list.length === 0) return "";
        var parts = [];
        for (var bi = 0; bi < list.length && bi < 3; bi++) {
            var one = list[bi].code;
            if (one.length > 16) one = one.substring(0, 16) + "…";
            parts.push("第 " + list[bi].line + " 行「" + one + "」");
        }
        if (list.length > 3) parts.push("等 " + list.length + " 行");
        return parts.join("、");
    }

    // =====================================================
    // 获取当前活动图层
    // =====================================================
    var workLayer = doc.activeLayer;

    // 安全检查：确保当前图层没有被锁定且可见
    if (workLayer.locked || !workLayer.visible) {
        var lockMsg = "当前选中的图层已被锁定或隐藏，请解锁或选择其他图层后再运行脚本。";
        alert(lockMsg);
        return zwsResult(0, true, lockMsg); // 业务失败 → 前端标红(旧版只回传文本,前端一律当成功)
    }

    // =====================================================
    // 工具函数
    // =====================================================
    function mm(v) {
        return v * 72 / 25.4;
    }

    // 2026-09-14 (v2.6): 文字属性设置 + PARM 抖动重试。
    // 真机报过 Error 1200 / 1346458189 ('PARM') at attr.size = 7.5 —— 这是 Illustrator
    // ExtendScript 有名的抖动(Adobe KB: 同一 session 反复跑脚本致引擎状态累积/全局污染;
    // uservoice: 循环里 setter 偶发 PARM, 社区还有"隔次失败"的实例), 与设的值无关。
    // 对策三条: ①失败就重新取一次 textRange 再试(最多 3 次)——抖动常表现为引用失效;
    // ②字体先设、字号/颜色后设(属性 setter 在"当前字体不可用"的上下文里更容易抛);
    // ③三次都失败也不往外抛, 由调用方计数并回报 —— 不让一个属性把整批条码带崩。
    // (旧版是裸赋值, 一抛就整批中断: 前面的黑白条已画出、后面所有条码的数字全没有,
    //  面板还只显示"执行失败", 用户看不出到底哪一步断了。)
    function setTextAttributes(frame, font, sizePt) {

        // v3.2: 目标字体名先取出来, 用于设置后的回读校验
        var want = "";
        if (font) {
            try { want = String(font.name || ""); } catch (eName) {}
        }

        for (var attempt = 0; attempt < 3; attempt++) {
            try {
                var tr = frame.textRange;              // 每轮重取, 不用上一轮的引用
                if (font) {
                    tr.characterAttributes.textFont = font;
                }
                tr.characterAttributes.size = sizePt;
                tr.characterAttributes.fillColor = black;
                tr.characterAttributes.strokeWeight = 0;

                // v3.2: 回读校验 —— "赋值没抛错"不等于"字体真的生效"。
                // 衬线体事故(2026-10-21)就是这样漏过去的: 属性 set 成功了, 但 AI 里该字体
                // 其实是占位/不可用, 文字回退成默认字体, 而脚本以为一切正常。
                if (font) {
                    var applied = "";
                    try { applied = String(tr.characterAttributes.textFont.name || ""); }
                    catch (eRead) { return 1; }        // 读不下名字 ⇒ 保守当成功(宁可漏报不误报)
                    if (want && applied && applied !== want) return 2;   // 赋上了却没生效
                }
                return 1;
            } catch (eAttr) {}
        }

        return 0;
    }

    // =====================================================
    // 参数
    // =====================================================
    var labelW = mm(32);
    var labelH = mm(11);

    var barW = mm(30);
    var barH = mm(6.2);

    var barOffsetX = mm(1);
    var barTopMargin = mm(0.7);

    var spacingY = mm(15);

    // 整体内容下移 0.4mm（白底不动）
    var contentShiftY = mm(0.4);

    // =====================================================
    // 获取画板中心
    // =====================================================
    var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()];
    var rect = ab.artboardRect;

    var centerX = (rect[0] + rect[2]) / 2;
    var centerY = (rect[1] + rect[3]) / 2;

    // =====================================================
    // 颜色
    // =====================================================
    var black = new CMYKColor();
    black.black = 100;

    var white = new CMYKColor();
    white.black = 0;

    // =====================================================
    // Code128 Pattern
    // =====================================================
    var patterns = [
        "212222","222122","222221","121223","121322","131222",
        "122213","122312","132212","221213","221312","231212",
        "112232","122132","122231","113222","123122","123221",
        "223211","221132","221231","213212","223112","312131",
        "311222","321122","321221","312212","322112","322211",
        "212123","212321","232121","111323","131123","131321",
        "112313","132113","132311","211313","231113","231311",
        "112133","112331","132131","113123","113321","133121",
        "313121","211331","231131","213113","213311","213131",
        "311123","311321","331121","312113","312311","332111",
        "314111","221411","431111","111224","111422","121124",
        "121421","141122","141221","112214","112412","122114",
        "122411","142112","142211","241211","221114","413111",
        "241112","134111","111242","121142","121241","114212",
        "124112","124211","411212","421112","421211","212141",
        "214121","412121","111143","111341","131141","114113",
        "114311","411113","411311","113141","114131","311141",
        "411131","211412","211214","211232","2331112"
    ];

    // =====================================================
    // 查找字体（v3.3: 只认两个名字，其他字体一概不用）
    // 2026-10-22 用户要求: 优先 FZHTJW--GB1-0(方正黑体简体), 其次 FZHTK--GBK1-0(方正黑体_GBK);
    // 这两个都没有就**不要用别的字体**, 直接不生成并提示去装字体。
    // 起因: v3.2 的"扫 app.textFonts 找带 黑/Hei 的字体"在真机上误命中了
    // FZBAOHTS--GB1-0(方正报宋一类) —— 条码数字变成别的字体, 比原来用默认字体更难发现。
    // 结论: 与其猜, 不如只认用户指定的两个。宁可不出, 不出错。
    // ⚠ v2.5 那套"占位条目"判据(style 空且 family 空/等于名字 ⇒ 当作没装)已撤:
    //   它对中文字体极易误杀(很多中文 TTF 的 style 就是空)。改用**设置后回读字体名**来验真伪,
    //   见 setTextAttributes 的 return 2 分支。
    // =====================================================
    var FONT_TARGETS = [
        "FZHTJW--GB1-0",   // 方正黑体简体  —— 首选
        "FZHTK--GBK1-0"    // 方正黑体_GBK   —— 次选
    ];
    // 后缀(GB1-0 / GBK1-0)可能因版本不同, 所以窄扫时按族前缀认; 但**只认这两个族**
    var FONT_PREFIXES = ["FZHTJW", "FZHTK"];

    var fontScan = { total: 0 };

    function fontNameOf(f) {
        try { return String(f.name || ""); } catch (e0) { return ""; }
    }

    function findFont() {

        var i, f;

        // ① 精确 PostScript 名
        for (i = 0; i < FONT_TARGETS.length; i++) {
            f = null;
            try { f = app.textFonts.getByName(FONT_TARGETS[i]); } catch (eGet) {}
            if (f) return f;
        }

        // ② 窄扫描: 只认 FZHTJW / FZHTK 两个族, 按上面 FONT_PREFIXES 的顺序优先
        var total = 0;
        try { total = app.textFonts.length; } catch (eLen) { return null; }
        if (!total || total < 1) return null;
        fontScan.total = total;

        for (var t = 0; t < FONT_PREFIXES.length; t++) {
            var prefix = FONT_PREFIXES[t];
            for (i = 0; i < total; i++) {
                f = null;
                try { f = app.textFonts[i]; } catch (e1) { continue; }
                if (!f) continue;
                if (fontNameOf(f).toUpperCase().indexOf(prefix) !== 0) continue;
                return f;
            }
        }

        return null;
    }

    var barcodeFont = findFont();
    var fontMissing = !barcodeFont;
    var fontName = barcodeFont ? fontNameOf(barcodeFont) : "";

    // v3.3: 两个指定字体都没有 ⇒ 不生成, 而不是偷偷换成别的字体
    if (fontMissing) {
        var missMsg = "未找到 方正黑体简体(" + FONT_TARGETS[0] + ") 或 方正黑体_GBK(" + FONT_TARGETS[1] + ")。"
            + "按设置不会用其他字体代替，本次未生成。请安装其中一个字体后重试。"
            + (fontScan.total > 0 ? "（已扫全部 " + fontScan.total + " 条字体）" : "");
        alert(missMsg);
        return zwsResult(0, true, missMsg);
    }

    // =====================================================
    // 生成单个条码
    // =====================================================
    function generateBarcode(code, index, firstTopY) {

        var group = workLayer.groupItems.add();
        group.name = "条码_" + code;

        var startX = centerX - labelW / 2;
        var startY = firstTopY - (index * spacingY);   // v2.2: 起排点由调用方算好(可接在已有条码下方)

        // -----------------------------
        // Code128B 编码
        // -----------------------------
        var codes = [104];

        // 2026-09-11 (v2.3): 这里原本还有一段 ascii 越界的兜底与弹窗, 但上面已经按
        // \x20-\x7E 过滤过 codeList, 每行的 ascii 必然落在 32..126, 那段永远不会执行;
        // 真执行到还会留下一个空组、让后面的计数虚高。已删除。
        for (var i = 0; i < code.length; i++) {
            codes.push(code.charCodeAt(i) - 32);
        }

        // 校验位
        var sum = 104;
        for (var j = 1; j < codes.length; j++) {
            sum += codes[j] * j;
        }

        codes.push(sum % 103);
        codes.push(106);

        // -----------------------------
        // 模块计算
        // -----------------------------
        var modules = [];
        var total = 0;

        for (var a = 0; a < codes.length; a++) {
            var p = patterns[codes[a]];
            for (var b = 0; b < p.length; b++) {
                var n = parseInt(p.charAt(b), 10);
                modules.push(n);
                total += n;
            }
        }

        var moduleW = barW / total;

        // -----------------------------
        // 白底 (根据用户勾选决定是否生成)
        // -----------------------------
        var bg;
        if (keepBackground) {
            bg = group.pathItems.rectangle(
                startY,
                startX,
                labelW,
                labelH
            );

            bg.filled = true;
            bg.stroked = false;
            bg.fillColor = white;
        }

        // -----------------------------
        // 条码
        // -----------------------------
        var barGroup = group.groupItems.add();
        var x = startX + barOffsetX;
        var blackBar = true;
        var barTopY = startY - barTopMargin - contentShiftY;

        for (var k = 0; k < modules.length; k++) {
            var w = modules[k] * moduleW;

            if (blackBar) {
                var rectBar = barGroup.pathItems.rectangle(
                    barTopY,
                    x,
                    w,
                    barH
                );

                rectBar.filled = true;
                rectBar.stroked = false;
                rectBar.fillColor = black;
            }

            x += w;
            blackBar = !blackBar;
        }

        // -----------------------------
        // 文字
        // -----------------------------
        var textBaselineY = startY - labelH + mm(1.5) - contentShiftY;

        var textFrame = group.textFrames.pointText([
            startX + labelW / 2,
            textBaselineY
        ]);

        textFrame.contents = code;

        // v2.6: 属性设置走 setTextAttributes(内部重试 + 不抛, 见其注释)。
        // 旧版是四行裸赋值, 任一行抛 PARM 都会让整批条码中断。
        // v3.2: 返回值改成分级 —— 0 失败 / 1 成功 / 2 字体回读不一致
        var attrState = setTextAttributes(textFrame, barcodeFont, 7.5);
        if (!attrState) {
            textAttrFailed++;
        } else if (attrState === 2) {
            fontNotApplied++;
        }

        try {
            textFrame.paragraphs[0].paragraphAttributes.justification =
                Justification.CENTER;
        } catch (eJust) {}

        // 文字转曲
        if (outlineText) {
            try {
                textFrame.createOutline();
            } catch (e) {
                // 2026-09-11 (v2.2): 原来这里静默吞掉——勾了转曲却失败也看不出来,
                // 现在计数后随结果回报, 提醒手动转曲。
                outlineFailed++;
            }
        }

        // 白底置底
        if (keepBackground && bg) {
            bg.zOrder(ZOrderMethod.SENDTOBACK);
        }
    }

    // =====================================================
    // 批量生成
    // =====================================================
    app.executeMenuCommand("deselectall");

    // 2026-09-11 (v2.2): 起排位置。原来每批都从画板中心往下排、不看画布上已有什么,
    // 连点两次第二批会严丝合缝压在第一批上(实测 41/41 个矩形坐标相同), 而面板还显示
    // "累计生成 N 个条码" —— 提示与实际打架。现在先找同图层里已有条码组的最低点,
    // 本批接着往下排; 图层里没有条码组时才从画板中心开始。
    var firstTopY = centerY + labelH / 2;
    var lowestBottom = null;
    for (var gi = 0; gi < workLayer.groupItems.length; gi++) {
        var gItem = workLayer.groupItems[gi];
        if (gItem.name && gItem.name.indexOf("条码_") === 0) {
            var bb = gItem.geometricBounds; // [left, top, right, bottom]
            if (bb && (lowestBottom === null || bb[3] < lowestBottom)) {
                lowestBottom = bb[3];
            }
        }
    }
    if (lowestBottom !== null) {
        firstTopY = lowestBottom - (spacingY - labelH); // 与上一批保持原有行距
    }

    // 转曲失败计数(见 generateBarcode)
    var outlineFailed = 0;
    // v2.6: 文字属性设置失败计数(重试 3 次仍抛 PARM, 见 setTextAttributes)
    var textAttrFailed = 0;
    // v3.2: 字体赋上了但回读名字不一致的个数(见 setTextAttributes 的 return 2)
    var fontNotApplied = 0;

    for (var i = 0; i < codeList.length; i++) {
        generateBarcode(codeList[i], i, firstTopY);
    }

    // 2026-09-11: 回传执行结果——旧版此处没有返回值,前端拿不到任何信息,
    // 只能一律显示"完成",失败也看不出来。现已把生成数与跳过的非法行一并回传。
    var tail = "";
    // v3.3: 字体缺失已在开头直接 return(不生成), 这里只回显实际用的字体名
    if (fontName) {
        tail += " 字体 " + fontName + "。";
    }
    if (fontNotApplied > 0) {
        // v3.2: 字体"赋上了但没生效"(回读名字不一致) —— 这是衬线体事故的真正入口, 必须报
        tail += " " + fontNotApplied + " 个条码的字体未生效(仍可能是默认字体), 请检查该字体是否真的安装。";
    }
    if (outlineFailed > 0) {
        tail += " " + outlineFailed + " 个文字转曲失败, 请手动转曲。";
    }
    if (textAttrFailed > 0) {
        tail += " " + textAttrFailed + " 个条码的文字属性设置失败(字号可能不对), 建议重跑一次。";
    }
    if (badLines.length > 0) {
        tail += " 跳过 " + badLines.length + " 行(含非法字符,仅支持半角字符): " + badLinesText(badLines);
    }

    return zwsResult(codeList.length, false, "已生成 " + codeList.length + " 个条码。" + tail);

}
