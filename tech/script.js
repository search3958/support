
    const DOCUMENTATION_CONFIG = {
        defaultPage: "overview",
        queryParameter: "page"
    };

    const documentationState = {
        pages: new Map(),
        activePageId: null
    };

    function logInfo(message, data = null) {
        if (data === null) {
            console.info("[documentation]", message);
            return;
        }

        console.info("[documentation]", message, data);
    }

    function logWarn(message, data = null) {
        if (data === null) {
            console.warn("[documentation]", message);
            return;
        }

        console.warn("[documentation]", message, data);
    }

    function logError(message, data = null) {
        if (data === null) {
            console.error("[documentation]", message);
            return;
        }

        console.error("[documentation]", message, data);
    }

    function getRequiredElement(id) {
        const element = document.getElementById(id);

        if (!element) {
            logError(`必要な要素が見つかりません: #${id}`);
            return null;
        }

        return element;
    }

    function getPageIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const requestedPage = params.get(
            DOCUMENTATION_CONFIG.queryParameter
        );

        if (!requestedPage) {
            logInfo(
                "URLにページ指定がないためデフォルトページを使用します。",
                DOCUMENTATION_CONFIG.defaultPage
            );

            return DOCUMENTATION_CONFIG.defaultPage;
        }

        const pageExists = DOCUMENTATION_PAGES.some(
            page => page.id === requestedPage
        );

        if (!pageExists) {
            logWarn(
                "URLで指定されたページが存在しません。デフォルトページを使用します。",
                requestedPage
            );

            return DOCUMENTATION_CONFIG.defaultPage;
        }

        return requestedPage;
    }

    function extractMarkdownTitle(markdown, fallbackTitle) {
        if (fallbackTitle) {
            return fallbackTitle;
        }

        if (typeof markdown !== "string") {
            logWarn("Markdownが文字列ではありません。");
            return "Untitled";
        }

        /*
         * 最初の # 見出しをタイトルとして取得。
         * "# Title" のみを対象にする。
         */
        const headingMatch = markdown.match(
            /^\s*#\s+(.+?)\s*$/m
        );

        if (headingMatch && headingMatch[1]) {
            const title = headingMatch[1]
                .replace(/[*_~`]/g, "")
                .trim();

            if (title) {
                return title;
            }
        }

        logWarn(
            "Markdownからタイトルを取得できませんでした。",
            fallbackTitle
        );

        return "Untitled";
    }

    async function loadMarkdownPage(pageDefinition) {
        if (
            !pageDefinition ||
            !pageDefinition.id ||
            !pageDefinition.file
        ) {
            throw new Error("Markdownページ定義が不正です。");
        }

        logInfo("Markdown読み込み開始", pageDefinition);

        const response = await fetch(pageDefinition.file, {
            method: "GET",
            cache: "no-cache"
        });

        if (!response.ok) {
            throw new Error(
                `Markdown読み込み失敗: ${response.status} ${response.statusText}`
            );
        }

        const markdown = await response.text();

        if (!markdown.trim()) {
            throw new Error("Markdownファイルが空です。");
        }

        const title = extractMarkdownTitle(
            markdown,
            pageDefinition.title
        );

        const pageData = {
            id: pageDefinition.id,
            file: pageDefinition.file,
            title,
            markdown
        };

        documentationState.pages.set(
            pageDefinition.id,
            pageData
        );

        logInfo("Markdown読み込み成功", {
            id: pageData.id,
            title: pageData.title,
            file: pageData.file
        });

        return pageData;
    }

    async function loadAllMarkdownPages() {
        if (!Array.isArray(DOCUMENTATION_PAGES)) {
            throw new Error("DOCUMENTATION_PAGESが配列ではありません。");
        }

        if (DOCUMENTATION_PAGES.length === 0) {
            throw new Error("Markdownページが1つも定義されていません。");
        }

        /*
         * 全Markdownを最初に読み込む。
         * Promise.allSettledを使うことで、
         * 1ページの失敗で他ページまで利用不能にならない。
         */
        const results = await Promise.allSettled(
            DOCUMENTATION_PAGES.map(loadMarkdownPage)
        );

        let successCount = 0;
        let failureCount = 0;

        results.forEach((result, index) => {
            const pageDefinition = DOCUMENTATION_PAGES[index];

            if (result.status === "fulfilled") {
                successCount++;
                return;
            }

            failureCount++;

            logError(
                "Markdownページの読み込みに失敗しました。",
                {
                    id: pageDefinition?.id,
                    file: pageDefinition?.file,
                    error: result.reason
                }
            );
        });

        logInfo("Markdownの初期読み込み完了", {
            total: DOCUMENTATION_PAGES.length,
            success: successCount,
            failed: failureCount
        });

        if (successCount === 0) {
            throw new Error(
                "Markdownを1つも読み込めませんでした。"
            );
        }
    }

    function createNavigation() {
        const navigation = getRequiredElement("docs-navigation");

        if (!navigation) {
            return;
        }

        navigation.replaceChildren();

        DOCUMENTATION_PAGES.forEach(pageDefinition => {
            const pageData = documentationState.pages.get(
                pageDefinition.id
            );

            if (!pageData) {
                logWarn(
                    "読み込みに失敗したページをナビゲーションから除外します。",
                    pageDefinition.id
                );
                return;
            }

            const link = document.createElement("a");

            link.className = "docs-nav-item";
            link.dataset.pageId = pageData.id;
            link.href = `?${encodeURIComponent(
                DOCUMENTATION_CONFIG.queryParameter
            )}=${encodeURIComponent(pageData.id)}`;
            link.textContent = pageData.title;

            link.addEventListener("click", event => {
                /*
                 * 通常のページ遷移ではなく、
                 * History APIでURLだけ変更して表示を切り替える。
                 */
                event.preventDefault();

                setActivePage(pageData.id, true);
            });

            navigation.appendChild(link);
        });

        logInfo(
            "ページ一覧を生成しました。",
            navigation.children.length
        );
    }

    function updateNavigationState(pageId) {
        const navigation = getRequiredElement("docs-navigation");

        if (!navigation) {
            return;
        }

        const items = navigation.querySelectorAll(
            ".docs-nav-item"
        );

        items.forEach(item => {
            if (!(item instanceof HTMLElement)) {
                return;
            }

            const isActive =
                item.dataset.pageId === pageId;

            item.classList.toggle(
                "is-active",
                isActive
            );

            if (isActive) {
                item.setAttribute("aria-current", "page");
            } else {
                item.removeAttribute("aria-current");
            }
        });
    }

    function renderMarkdown(pageData) {
        const markdownContainer =
            getRequiredElement("support-markdown");

        if (!markdownContainer) {
            return false;
        }

        if (
            !pageData ||
            typeof pageData.markdown !== "string"
        ) {
            logError("表示対象のMarkdownが不正です。");
            return false;
        }

        if (
            typeof marked === "undefined" ||
            typeof marked.parse !== "function"
        ) {
            logError(
                "markedが読み込まれていません。"
            );
            return false;
        }

        try {
            markdownContainer.innerHTML =
                marked.parse(pageData.markdown);

            document.title =
                `${pageData.title} - Documentation`;

            logInfo("Markdownを表示しました。", {
                id: pageData.id,
                title: pageData.title
            });

            return true;
        } catch (error) {
            logError(
                "Markdownの変換に失敗しました。",
                error
            );

            return false;
        }
    }

    function showError(message) {
        const errorContainer =
            getRequiredElement("markdown-error");

        if (!errorContainer) {
            return;
        }

        errorContainer.textContent = message;
        errorContainer.hidden = false;

        logError(message);
    }

    function hideError() {
        const errorContainer =
            getRequiredElement("markdown-error");

        if (!errorContainer) {
            return;
        }

        errorContainer.hidden = true;
        errorContainer.textContent = "";
    }

    function updateUrl(pageId) {
        const url = new URL(window.location.href);

        url.searchParams.set(
            DOCUMENTATION_CONFIG.queryParameter,
            pageId
        );

        window.history.pushState(
            { pageId },
            "",
            url
        );

        logInfo("URLを更新しました。", {
            pageId,
            url: url.toString()
        });
    }

    function setActivePage(pageId, updateHistory = false) {
        const pageData =
            documentationState.pages.get(pageId);

        if (!pageData) {
            logWarn(
                "指定されたページが読み込まれていません。",
                pageId
            );

            const fallback =
                documentationState.pages.get(
                    DOCUMENTATION_CONFIG.defaultPage
                );

            if (!fallback) {
                showError(
                    "表示可能なMarkdownページがありません。"
                );
                return false;
            }

            pageId = fallback.id;
            pageData = fallback;
        }

        hideError();

        const rendered =
            renderMarkdown(pageData);

        if (!rendered) {
            showError(
                `「${pageData.title}」を表示できませんでした。`
            );
            return false;
        }

        documentationState.activePageId = pageId;

        updateNavigationState(pageId);

        if (updateHistory) {
            updateUrl(pageId);
        }

        /*
         * ページ切り替え時に本文先頭へ戻す。
         */
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

        logInfo("アクティブページを変更しました。", pageId);

        return true;
    }

    function initializeNavigationEvents() {
        window.addEventListener("popstate", event => {
            const pageId =
                event.state?.pageId ||
                getPageIdFromUrl();

            logInfo(
                "ブラウザ履歴によるページ変更を検出しました。",
                pageId
            );

            setActivePage(pageId, false);
        });

        logInfo("Navigationイベントを初期化しました。");
    }

    async function initializeDocumentation() {
        logInfo("Documentation初期化開始");

        try {
            await loadAllMarkdownPages();

            createNavigation();
            initializeNavigationEvents();

            const requestedPage =
                getPageIdFromUrl();

            const initialPage =
                documentationState.pages.has(requestedPage)
                    ? requestedPage
                    : DOCUMENTATION_CONFIG.defaultPage;

            if (
                !documentationState.pages.has(
                    initialPage
                )
            ) {
                const firstAvailablePage =
                    DOCUMENTATION_PAGES.find(page =>
                        documentationState.pages.has(page.id)
                    );

                if (!firstAvailablePage) {
                    throw new Error(
                        "表示可能なページがありません。"
                    );
                }

                setActivePage(
                    firstAvailablePage.id,
                    false
                );
            } else {
                setActivePage(
                    initialPage,
                    false
                );
            }

            logInfo("Documentation初期化成功");
        } catch (error) {
            logError(
                "Documentation初期化に失敗しました。",
                error
            );

            showError(
                "ドキュメントを読み込めませんでした。ページを再読み込みしてください。"
            );
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initializeDocumentation,
            { once: true }
        );
    } else {
        initializeDocumentation();
    }