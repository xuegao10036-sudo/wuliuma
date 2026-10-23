(function () {
    var cs = new CSInterface();

    // 2026-09-11: 运行锁——批量生成条码耗时较长,期间连点按钮会排队重复执行,
    // 结果是在同一位置叠出两套条码。现在运行期间后续点击直接忽略。
    var busy = false;

    // 2026-09-11 (v2.3): 加锁超时兜底。evalScript 的回调偶发不返回(CEP 已知问题),
    // 旧版没有兜底 → busy 一直是 true、按钮永久置灰,用户只能重载面板。
    // 默认 120 秒(批量条码很慢,设太短会误报"超时"而掩盖真实结果);传 timeout:0 可关闭。
    var DEFAULT_TIMEOUT = 120000;

    // 2026-09-11 (v2.3): 结果协议。jsx 用一个固定字段把"生成了几个/是否业务失败"告诉前端,
    // 前端不再去正则匹配给用户看的文案——旧做法与文案强耦合, 哪天把
    // "已生成 N 个条码。" 改个说法, 累计和标红就会一起静默失效。
    // 格式: ZW1|<生成数量>|<业务失败 0/1>|<展示文案>
    // 不带这个前缀的返回值(例如整理图片面板的 jsx)按纯文本处理, 不参与累计。
    var RESULT_TAG = "ZW1|";

    // 2026-09-14 (v2.5): 解析加固。mock 只能证明前端与 jsx 各自守协议, 证明不了
    // CEP 的 evalScript 字符串桥接会原样传回——它可能给字符串返回值再包一层 JSON
    // 引号(也可能夹空白/加前缀)。旧版那条正则要求标记**紧贴字符串行首**, 一旦被
    // 包过就静默失配: 累计与标红一起失效, 而且用户会在状态行直接看到内部协议串。
    // 现在: 先去首尾空白 → 首尾若是成对双引号则剥一层(顺带还原 \" \n \r) →
    // 用 indexOf 定位标记、按 | 切分, 不再要求标记在行首。
    function normalizeResult(raw) {
        var s = String(raw === undefined || raw === null ? "" : raw).replace(/^\s+|\s+$/g, "");
        if (s.length > 1 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
            s = s.substring(1, s.length - 1)
                .replace(/\\"/g, '"')
                .replace(/\\n/g, "\n")
                .replace(/\\r/g, "\r");
            s = s.replace(/^\s+|\s+$/g, "");
        }
        return s;
    }

    function parseResult(raw) {
        var s = normalizeResult(raw);
        var at = s.indexOf(RESULT_TAG);
        if (at < 0) return { count: null, error: false, text: s, known: false };

        // 只切前两段: 展示文案里允许再出现 | (例如"跳过 1 行|第 1 行")
        var rest = s.substring(at + RESULT_TAG.length);
        var p1 = rest.indexOf("|");
        var p2 = p1 < 0 ? -1 : rest.indexOf("|", p1 + 1);
        if (p1 < 0 || p2 < 0) return { count: null, error: false, text: rest, known: false };

        var countStr = rest.substring(0, p1);
        var flag = rest.substring(p1 + 1, p2);
        var textPart = rest.substring(p2 + 1);
        if (/^-?\d+$/.test(countStr) && (flag === "0" || flag === "1")) {
            return { count: Number(countStr), error: flag === "1", text: textPart, known: true };
        }
        // 认得出标记但字段不合法: 只取文案那段, 不把协议头露给用户
        return { count: null, error: false, text: textPart, known: false };
    }

    // 2026-09-11 (v2.0): 连续生成时累计——第二次起在结果后面追加"累计生成 X 个条码"。
    // 只有条码面板传 accumulate:true; 计数只认"确实生成出条码"的那一次(失败/0 个不计次也不累加),
    // 面板重载即清零(变量活在页面里)。
    // (v2.3: 数量改从结果协议取, 不再解析文案)
    var genTotal = 0, genRuns = 0;
    function withTotal(parsed, options) {
        if (!options || !options.accumulate) return parsed.text;
        var n = parsed.count;
        if (typeof n !== "number" || !(n > 0)) return parsed.text;
        genTotal += n;
        genRuns += 1;
        if (genRuns === 1) return parsed.text;
        return parsed.text + "累计生成 " + genTotal + " 个条码。";
    }

    // 2026-09-11 (v1.8): "已生成 N 个条码" / "累计生成 X 个条码"里的数字单独包一层 span, 数值 > 0 时追加 .is-hit 标黄。
    // 文本先做 HTML 转义再拼装——返回值会进 innerHTML, 必须挡住 < > & 破坏面板结构。
    function decorateStatus(text) {
        var esc = String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        return esc.replace(/(已生成|累计生成) (\d+) 个条码/g, function (matched, kw, n) {
            return kw + " <span class=\"status-num" + (Number(n) > 0 ? " is-hit" : "") + "\">" + n + "</span> 个条码";
        });
    }

    // 2026-10-12 (v2.9): 加第三参 statusId —— 两个面板合并成一个后, 每个页签各有自己的 #status 元素,
    // 而 getElementById("status") 只认 DOM 里**第一个**, 不区分的话另一个页签的状态行永远不会更新
    // (表现: 在"整理图片"页点按钮, 进度/结果全写到"条码生成"页的状态行上, 当前页零反馈)。
    // 缺省仍是 "status", 单页面板(以及旧的两页)行为一字未变。
    function setStatus(text, isError, statusId) {
        var statusEl = document.getElementById(statusId || "status");
        if (!statusEl) return;
        statusEl.innerHTML = decorateStatus(text === undefined || text === null ? "" : text);
        if (isError) statusEl.classList.add("is-error");
        else statusEl.classList.remove("is-error");
    }

    function escapePath(path) {
        return String(path).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    function toScriptObject(value) {
        return JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }

    // 注: getSystemPath 返回的是 URL 编码路径,若扩展目录含空格/中文会解析失败;
    //     当前安装路径无此类字符,故维持原样(如需处理,加一次 decodeURI 即可)。
    function jsxFullPath(filename) {
        return cs.getSystemPath(SystemPath.EXTENSION) + "/jsx/" + filename;
    }

    // 2026-09-11: 统一调用出口。旧版忽略 evalScript 的回调参数,无论成功、
    // 报错还是脚本抛异常,面板都一律显示"完成",用户无法察觉失败。
    // 现在: 空返回值 / undefined / EvalScript error 都判为失败并标红。
    function callJsx(jsx, options) {
        options = options || {};

        if (busy) {
            // v2.3: 这句不是失败, 不该标红(以前是红的, 和"请稍候"自相矛盾)
            setStatus("正在运行中，请稍候…", false, options.statusId);
            return;
        }
        busy = true;
        if (options.button) options.button.disabled = true;
        setStatus(options.runningText || "正在运行...", false, options.statusId);

        var finished = false;
        var timer = null;

        function finish(rawText, isError) {
            if (finished) return;
            finished = true;
            if (timer) { clearTimeout(timer); timer = null; }
            busy = false;
            if (options.button) options.button.disabled = false;
            // v2.3: 业务失败由 jsx 通过结果协议标记; 传输层失败由调用方传 isError。
            var parsed = parseResult(rawText === undefined || rawText === null ? "" : String(rawText));
            setStatus(withTotal(parsed, options), isError || parsed.error, options.statusId);
            if (typeof options.onDone === "function") options.onDone(parsed.text);
        }

        // v2.3: 超时兜底——回调不返回时解除锁定并给出提示(用 finished 守卫,
        // 迟到的真实回调不会再覆盖提示)。
        var timeoutMs = options.timeout === undefined ? DEFAULT_TIMEOUT : Number(options.timeout);
        if (timeoutMs > 0) {
            timer = setTimeout(function () {
                timer = null;
                finish("执行超时：Illustrator 在 " + Math.round(timeoutMs / 1000) +
                    " 秒内没有返回结果，已解除锁定。脚本可能仍在后台运行，请先查看画布；" +
                    "若确认没有反应，请重启 Illustrator 后重试。", true);
            }, timeoutMs);
        }

        try {
            cs.evalScript(jsx, function (result) {
                // v2.5: 先过 normalizeResult——桥接若给字符串包了引号, 下面
                // ""/"undefined"/"EvalScript error." 三个精确比较都会失配。
                var r = normalizeResult(result);
                // ""/EvalScript error = 脚本没跑起来或抛异常,判失败并标红;
                // "undefined" = 脚本正常跑完但没返回值(如整理图片脚本),按成功处理。
                if (r === "" || r === "EvalScript error.") {
                    finish("执行失败：脚本没有正常返回。请确认 jsx 文件存在、语法无误，或重启 Illustrator 后重试。", true);
                    return;
                }
                if (r === "undefined") {
                    finish(options.doneText || "完成。", false);
                    return;
                }
                finish(r, false);
            });
        } catch (e) {
            finish("运行失败：" + e, true);
            alert("运行失败：\n" + e);
        }
    }

    window.runZWScript = function (filename, options) {
        options = options || {};
        callJsx('$.evalFile("' + escapePath(jsxFullPath(filename)) + '")', options);
    };

    window.runZWFunction = function (filename, functionName, args, options) {
        options = options || {};
        callJsx('$.evalFile("' + escapePath(jsxFullPath(filename)) + '");' +
            functionName + '(' + toScriptObject(args || {}) + ');', options);
    };

})();
