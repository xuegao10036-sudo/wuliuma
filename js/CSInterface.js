(function () {
    if (typeof window.SystemPath === "undefined") {
        window.SystemPath = {
            USER_DATA: "userData",
            COMMON_FILES: "commonFiles",
            MY_DOCUMENTS: "myDocuments",
            APPLICATION: "application",
            EXTENSION: "extension",
            HOST_APPLICATION: "hostApplication"
        };
    }

    if (typeof window.CSInterface === "undefined") {
        window.CSInterface = function () {};
        CSInterface.prototype.evalScript = function (script, callback) {
            if (window.__adobe_cep__ && window.__adobe_cep__.evalScript) {
                window.__adobe_cep__.evalScript(script, callback || function () {});
            } else {
                alert("没有检测到 Adobe CEP 环境，请在 Illustrator 的扩展面板中打开。");
            }
        };
        CSInterface.prototype.getSystemPath = function (pathType) {
            if (window.__adobe_cep__ && window.__adobe_cep__.getSystemPath) {
                return window.__adobe_cep__.getSystemPath(pathType);
            }
            return "";
        };
        // 注: v1.1 曾在此加过 resizeContent(面板高度自适应),v1.2 已按用户要求
        //     改回固定高度并移除该方法 —— 需要时补 6 行转调 __adobe_cep__ 即可。
    }
})();
