#target illustrator
/*
  整理图片（面板"条码与整理图片"的第二个页签）
  功能：
  - 对当前选中的多个图片/对象一键整理。
  - 统一高度：取选中对象中最小高度作为目标高度。
  - 目标高度限制：最小 30mm，最大 400mm。
  - 等比缩放，不变形。
  - 每行数量：由面板传入（panelCfg.maxPerRow），默认 5，合法范围 1~20。
  - 图片间距：由面板传入（panelCfg.gap，单位 mm），默认 5，合法范围 0~50。
  - 无设置弹窗，无完成弹窗。

  v2.9 相对上一版只改了三处，其余逻辑一字未动：
  1) 原来是 (function () { ... })() 自执行 —— 由面板 runZWScript 纯 evalFile 调用，**收不到任何参数**。
     现在改成具名函数 ZW_organizeImagesRun(panelCfg)，由面板 runZWFunction 调用（与条码面板同款）。
  2) 每行数量原先写死 MAX_PER_ROW = 5 ⇒ 改为读 panelCfg.maxPerRow；缺失/非法/越界一律退回默认 5 或夹到 1~20。
  3) 出口补结果协议 —— 原来成功与"没选够图"这类前置失败都返回 undefined，前端只能显示"整理完成。"
     （漏检报通过）。现在失败回 ZW1|0|1|原因（前端标红），成功回实际整理张数（文案里带上本行数量）。

  v3.1: 间距原是写死的 var GAP = 5 * MM，改为读 panelCfg.gap。
     · 用 parseFloat 不用 parseInt —— 间距允许小数（2.5mm 是常见值）。
     · 负数/NaN/缺省一律退回默认 5（间距 -5 属非法输入，退回默认比夹到 0 更安全）。
     · 上界夹到 50mm；0 是合法值（图片紧贴）。
*/

function ZW_organizeImagesRun(panelCfg) {
    panelCfg = panelCfg || {};

    var DEFAULT_PER_ROW = 5;
    var MIN_PER_ROW = 1;
    var MAX_PER_ROW_LIMIT = 20;

    // v3.1: 间距（mm）。0 合法（紧贴），负数视为非法输入退回默认
    var DEFAULT_GAP = 5;
    var MAX_GAP_LIMIT = 50;

    // parseInt 对 undefined / "" / "abc" 都返回 NaN；NaN 与 0 一并退回默认值（!(n>=1) 同时覆盖两者）
    var maxPerRow = parseInt(panelCfg.maxPerRow, 10);
    if (!(maxPerRow >= MIN_PER_ROW)) maxPerRow = DEFAULT_PER_ROW;
    if (maxPerRow > MAX_PER_ROW_LIMIT) maxPerRow = MAX_PER_ROW_LIMIT;

    // v3.1: 间距用 parseFloat（允许 2.5mm 这种小数）；!(g >= 0) 一并覆盖 NaN 与负数
    var gapMM = parseFloat(panelCfg.gap);
    if (!(gapMM >= 0)) gapMM = DEFAULT_GAP;
    if (gapMM > MAX_GAP_LIMIT) gapMM = MAX_GAP_LIMIT;

    if (app.documents.length === 0) {
        alert("请先打开一个 Illustrator 文件。");
        return zwsOrgResult(0, true, "请先打开一个 Illustrator 文件。");
    }

    var doc = app.activeDocument;
    var sel = doc.selection;

    if (!sel || sel.length < 2) {
        alert("请先选中 2 个或以上需要整理的图片。");
        return zwsOrgResult(0, true, "请先选中 2 个或以上需要整理的图片。");
    }

    var MM = 72 / 25.4;
    var MIN_H = 30 * MM;
    var MAX_H = 400 * MM;
    var GAP = gapMM * MM;      // v3.1: 原写死 5 * MM，现由 panelCfg.gap 决定

    var items = [];
    for (var i = 0; i < sel.length; i++) {
        var it = sel[i];
        if (isUsableItem(it)) {
            var b = getBounds(it);
            var w = Math.abs(b[2] - b[0]);
            var h = Math.abs(b[1] - b[3]);
            if (w > 0.01 && h > 0.01) {
                items.push({
                    item: it,
                    left: b[0],
                    top: b[1],
                    width: w,
                    height: h
                });
            }
        }
    }

    if (items.length < 2) {
        alert("没有找到可整理的图片对象。请选中已置入/嵌入的图片或图片组。");
        return zwsOrgResult(0, true, "没有找到可整理的图片对象。请选中已置入/嵌入的图片或图片组。");
    }

    // 按当前位置从上到下、从左到右排序
    items.sort(function (a, b) {
        if (Math.abs(a.top - b.top) > 1) return b.top - a.top;
        return a.left - b.left;
    });

    var minHeight = items[0].height;
    for (var j = 1; j < items.length; j++) {
        if (items[j].height < minHeight) minHeight = items[j].height;
    }

    var targetHeight = minHeight;
    if (targetHeight < MIN_H) targetHeight = MIN_H;
    if (targetHeight > MAX_H) targetHeight = MAX_H;

    var startLeft = items[0].left;
    var startTop = items[0].top;

    var currentX = startLeft;
    var currentY = startTop;
    var placed = 0;

    for (var k = 0; k < items.length; k++) {
        var obj = items[k].item;

        var before = getBounds(obj);
        var beforeH = Math.abs(before[1] - before[3]);
        if (beforeH <= 0) continue;

        var scale = targetHeight / beforeH * 100;

        try {
            obj.resize(
                scale,
                scale,
                true,
                true,
                true,
                true,
                scale,
                Transformation.CENTER
            );
        } catch (eResize) {
            try {
                obj.height = targetHeight;
            } catch (eHeight) {}
        }

        var after = getBounds(obj);
        var afterW = Math.abs(after[2] - after[0]);

        // v2.9: 换行判据里的每行数量改成传入值（原来是常量 MAX_PER_ROW = 5）
        if (k > 0 && (k % maxPerRow) === 0) {
            currentX = startLeft;
            currentY = currentY - targetHeight - GAP;
        }

        moveTo(obj, currentX, currentY);
        placed++;

        currentX += afterW + GAP;
    }

    try {
        app.redraw();
    } catch (eRedraw) {}

    if (placed < 1) {
        return zwsOrgResult(0, true, "没有对象被移动（可能尺寸异常），未做整理。");
    }
    return zwsOrgResult(placed, false, "已整理 " + placed + " 张图片（每行 " + maxPerRow + " 个，间距 " + fmtNum(gapMM) + " mm）。");

    function isUsableItem(it) {
        if (!it) return false;

        try {
            if (it.locked || it.hidden) return false;
        } catch (e0) {}

        try {
            if (it.guides) return false;
        } catch (e1) {}

        var tn = "";
        try {
            tn = it.typename;
        } catch (e2) {}

        return (
            tn === "PlacedItem" ||
            tn === "RasterItem" ||
            tn === "GroupItem" ||
            tn === "CompoundPathItem" ||
            tn === "PathItem"
        );
    }

    function getBounds(it) {
        try {
            return it.visibleBounds;
        } catch (e1) {
            return it.geometricBounds;
        }
    }

    function moveTo(it, left, top) {
        var b = getBounds(it);
        var dx = left - b[0];
        var dy = top - b[1];
        try {
            it.translate(dx, dy);
        } catch (e1) {}
    }

    // v3.1: 间距允许小数，先把浮点毛刺（5.000000001）抹掉再进文案
    function fmtNum(v) {
        return String(Math.round(v * 100) / 100);
    }

    // v2.9: 与条码面板同款的结果协议 —— 前端才能分辨"真完成"与"没选够图"
    function zwsOrgResult(count, isError, text) {
        return "ZW1|" + count + "|" + (isError ? 1 : 0) + "|" + text;
    }
}
