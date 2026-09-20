#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

python3 - "$SCRIPT_DIR" <<'PY'
from pathlib import Path
import html
import json
import re
import sys

DOCS = Path(sys.argv[1])
SRC = DOCS / "src"
TEMPLATE = DOCS / "template.html"
SITE_BASE = "https://search3958.github.io/support"
SITE_NAME = "Sentaro Support"

LANGS = {
    "ja": {
        "html_lang": "ja",
        "locale": "ja_JP",
        "hreflang": "ja",
        "name": "日本語",
        "title_suffix": "サポート | Sentaro",
        "description": "Sentaroのサポート記事です。ツールの使い方、よくある質問、問題が発生した場合の確認事項をご案内します。",
        "keywords": "Sentaro, サポート, ヘルプ, 使い方, FAQ, お問い合わせ",
        "contact_title": "お問い合わせ",
        "contact_description": "何かございましたらご遠慮なく",
        "contact_button": "フォームを表示",
        "aria": "サポート情報",
        "loading": "サポート情報を読み込んでいます...",
        "error_empty": "Markdownの内容がありません。",
        "error_marked": "Markdownパーサーの読み込みに失敗しました。",
        "error_render": "Markdownを表示できませんでした。",
        "error_parse": "Markdownの解析中にエラーが発生しました。",
        "breadcrumb_home": "ホーム",
        "breadcrumb_support": "サポート",
    },
    "en": {
        "html_lang": "en",
        "locale": "en_US",
        "hreflang": "en",
        "name": "English",
        "title_suffix": "Support | Sentaro",
        "description": "Sentaro support article with guides, frequently asked questions, and troubleshooting information.",
        "keywords": "Sentaro, support, help, guide, FAQ, contact, troubleshooting",
        "contact_title": "Contact Us",
        "contact_description": "Please feel free to contact us if you have any questions.",
        "contact_button": "Open Contact Form",
        "aria": "Support information",
        "loading": "Loading support information...",
        "error_empty": "There is no Markdown content.",
        "error_marked": "Failed to load the Markdown parser.",
        "error_render": "The Markdown content could not be displayed.",
        "error_parse": "An error occurred while parsing Markdown.",
        "breadcrumb_home": "Home",
        "breadcrumb_support": "Support",
    },
    "zh": {
        "html_lang": "zh-CN",
        "locale": "zh_CN",
        "hreflang": "zh-CN",
        "name": "简体中文",
        "title_suffix": "支持 | Sentaro",
        "description": "Sentaro 支持文章，提供使用指南、常见问题以及故障排查信息。",
        "keywords": "Sentaro, 支持, 帮助, 使用指南, FAQ, 联系我们, 故障排查",
        "contact_title": "联系我们",
        "contact_description": "如有任何问题，欢迎随时联系我们。",
        "contact_button": "打开联系表单",
        "aria": "支持信息",
        "loading": "正在加载支持信息...",
        "error_empty": "没有可用的 Markdown 内容。",
        "error_marked": "Markdown 解析器加载失败。",
        "error_render": "无法显示 Markdown 内容。",
        "error_parse": "解析 Markdown 时发生错误。",
        "breadcrumb_home": "首页",
        "breadcrumb_support": "支持",
    },
    "zh-hk": {
        "html_lang": "zh-Hant-HK",
        "locale": "zh_HK",
        "hreflang": "zh-HK",
        "name": "繁體中文（香港）",
        "title_suffix": "支援 | Sentaro",
        "description": "Sentaro 支援文章，提供使用指南、常見問題及疑難排解資訊。",
        "keywords": "Sentaro, 支援, 幫助, 使用指南, FAQ, 聯絡我們, 疑難排解",
        "contact_title": "聯絡我們",
        "contact_description": "如有任何問題，歡迎隨時聯絡我們。",
        "contact_button": "開啟聯絡表單",
        "aria": "支援資訊",
        "loading": "正在載入支援資訊...",
        "error_empty": "沒有可用的 Markdown 內容。",
        "error_marked": "Markdown 解析器載入失敗。",
        "error_render": "無法顯示 Markdown 內容。",
        "error_parse": "解析 Markdown 時發生錯誤。",
        "breadcrumb_home": "主頁",
        "breadcrumb_support": "支援",
    },
    "ko": {
        "html_lang": "ko",
        "locale": "ko_KR",
        "hreflang": "ko",
        "name": "한국어",
        "title_suffix": "지원 | Sentaro",
        "description": "Sentaro 지원 문서입니다. 사용 방법, 자주 묻는 질문, 문제 해결 정보를 안내합니다.",
        "keywords": "Sentaro, 지원, 도움말, 사용 방법, FAQ, 문의, 문제 해결",
        "contact_title": "문의하기",
        "contact_description": "궁금한 점이 있으시면 언제든지 문의해 주세요.",
        "contact_button": "문의 양식 열기",
        "aria": "지원 정보",
        "loading": "지원 정보를 불러오는 중...",
        "error_empty": "Markdown 내용이 없습니다.",
        "error_marked": "Markdown 파서를 불러오지 못했습니다.",
        "error_render": "Markdown을 표시할 수 없습니다.",
        "error_parse": "Markdown을 해석하는 중 오류가 발생했습니다.",
        "breadcrumb_home": "홈",
        "breadcrumb_support": "지원",
    },
    "kp": {
        "html_lang": "ko-KP",
        "locale": "ko_KP",
        "hreflang": "ko-KP",
        "name": "조선어",
        "title_suffix": "지원 | Sentaro",
        "description": "Sentaro 지원 문서입니다. 리용 방법, 자주 묻는 질문, 문제 해결 정보를 안내합니다.",
        "keywords": "Sentaro, 지원, 도움말, 리용 방법, FAQ, 문의, 문제 해결",
        "contact_title": "문의하기",
        "contact_description": "문의하실 내용이 있으면 언제든지 연락해 주십시오.",
        "contact_button": "문의 양식 열기",
        "aria": "지원 정보",
        "loading": "지원 정보를 불러오는 중...",
        "error_empty": "Markdown 내용이 없습니다.",
        "error_marked": "Markdown 파서를 불러오지 못했습니다.",
        "error_render": "Markdown을 표시할 수 없습니다.",
        "error_parse": "Markdown을 해석하는 중 오류가 발생했습니다.",
        "breadcrumb_home": "홈",
        "breadcrumb_support": "지원",
    },
}

def yaml_quote(value: str) -> str:
    # Double-quoted YAML scalar with JSON-compatible escaping.
    return json.dumps(value, ensure_ascii=False)

def build_titles_yaml() -> str:
    # Keep the language order stable so the generated YAML matches the requested
    # compact list format:
    # slug:
    #   - Japanese title
    #   - English title
    #   - Korean title
    #   - Korean (KP) title
    #   - Simplified Chinese title
    #   - Traditional Chinese (HK) title
    title_lang_order = ["ja", "en", "ko", "kp", "zh", "zh-hk"]
    lines = []
    for md_path in sorted((SRC / "ja").glob("*.md")):
        slug = md_path.stem
        lines.append(f"{slug}:")
        for code in title_lang_order:
            target = SRC / code / f"{slug}.md"
            title = first_heading(target.read_text(encoding="utf-8")) if target.exists() else ""
            lines.append(f"  - {yaml_quote(title)}")
        lines.append("")
    lines.append("filename:")
    for code in title_lang_order:
        lines.append(f"  - {code}")
    lines.append("")
    return "\n".join(lines)

template_text = TEMPLATE.read_text(encoding="utf-8")

def first_heading(markdown: str) -> str:
    for line in markdown.splitlines():
        m = re.match(r"^\s*#\s+(.+?)\s*$", line)
        if m:
            return re.sub(r"[`*_~]", "", m.group(1)).strip()
    return "Sentaro Support"

def meta_description(markdown: str, lang: dict) -> str:
    # Prefer the first ordinary paragraph after the H1; fall back to the localized site description.
    seen_h1 = False
    parts = []
    for line in markdown.splitlines():
        s = line.strip()
        if not seen_h1:
            if s.startswith("# "):
                seen_h1 = True
            continue
        if not s or s.startswith("#") or s.startswith(">") or s.startswith("- ") or re.match(r"^\d+\.\s", s):
            if parts:
                break
            continue
        parts.append(s)
        if len(" ".join(parts)) >= 180:
            break
    raw = " ".join(parts) if parts else lang["description"]
    raw = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", raw)
    raw = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", raw)
    raw = re.sub(r"[*_`~>#]", "", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw[:157].rstrip() + ("..." if len(raw) > 160 else "")

def json_script(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2).replace("</", "<\\/")

def build_hreflang(slug: str):
    available = []
    for code, lang in LANGS.items():
        target = SRC / code / f"{slug}.md"
        if target.exists():
            available.append((code, lang))
    lines = []
    for code, lang in available:
        href = f"{SITE_BASE}/docs/{code}/{slug}.html"
        lines.append(f'  <link rel="alternate" hreflang="{html.escape(lang["hreflang"], quote=True)}" href="{href}">')
    xdefault_code = "en" if any(c == "en" for c, _ in available) else (available[0][0] if available else "ja")
    xdefault = next((c for c, _ in available if c == xdefault_code), "ja")
    lines.append(f'  <link rel="alternate" hreflang="x-default" href="{SITE_BASE}/docs/{xdefault}/{slug}.html">')
    return "\n".join(lines)

def build_og_alternates(slug: str):
    available = []
    for code, lang in LANGS.items():
        if (SRC / code / f"{slug}.md").exists():
            available.append(lang["locale"])
    return "\n".join(
        f'  <meta property="og:locale:alternate" content="{html.escape(locale, quote=True)}">'
        for locale in available
    )

# Generate the title map consumed by the root support index page.
(DOCS / "titles.yaml").write_text(build_titles_yaml(), encoding="utf-8")

# Clean and regenerate every supported language directory.
for code in LANGS:
    out_dir = DOCS / code
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.html"):
        old.unlink()

generated = []
for code, lang in LANGS.items():
    src_dir = SRC / code
    if not src_dir.exists():
        continue

    for md_path in sorted(src_dir.glob("*.md")):
        slug = md_path.stem
        markdown = md_path.read_text(encoding="utf-8")
        page_heading = first_heading(markdown)
        description = meta_description(markdown, lang)
        canonical = f"{SITE_BASE}/docs/{code}/{slug}.html"
        title = f"{page_heading} | Sentaro"
        keywords = lang["keywords"] + ", " + page_heading

        webpage_ld = {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": page_heading,
            "name": title,
            "description": description,
            "url": canonical,
            "inLanguage": lang["html_lang"],
            "isPartOf": {
                "@type": "WebSite",
                "name": "Sentaro",
                "url": "https://search3958.github.io"
            }
        }
        breadcrumb_ld = {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": 1,
                    "name": lang["breadcrumb_home"],
                    "item": "https://search3958.github.io/"
                },
                {
                    "@type": "ListItem",
                    "position": 2,
                    "name": lang["breadcrumb_support"],
                    "item": f"{SITE_BASE}/"
                },
                {
                    "@type": "ListItem",
                    "position": 3,
                    "name": page_heading,
                    "item": canonical
                }
            ]
        }

        replacements = {
            "{{LANG}}": html.escape(lang["html_lang"], quote=True),
            "{{TITLE}}": html.escape(title, quote=True),
            "{{DESCRIPTION}}": html.escape(description, quote=True),
            "{{KEYWORDS}}": html.escape(keywords, quote=True),
            "{{CANONICAL}}": canonical,
            "{{SITE_NAME}}": html.escape(SITE_NAME, quote=True),
            "{{OG_ALTERNATES}}": build_og_alternates(slug),
            "{{HREFLANG}}": build_hreflang(slug),
            "{{JSONLD_WEBPAGE}}": webpage_ld and json_script(webpage_ld),
            "{{JSONLD_BREADCRUMB}}": json_script(breadcrumb_ld),
            "{{ARIA_LABEL}}": html.escape(lang["aria"], quote=True),
            "{{LOADING}}": html.escape(lang["loading"]),
            "{{CONTACT_TITLE}}": html.escape(lang["contact_title"]),
            "{{CONTACT_DESCRIPTION}}": html.escape(lang["contact_description"]),
            "{{CONTACT_BUTTON}}": html.escape(lang["contact_button"]),
            "{{MARKDOWN_JSON}}": json.dumps(markdown, ensure_ascii=False).replace("</", "<\\/"),
            "{ERROR_EMPTY}": json.dumps(lang["error_empty"], ensure_ascii=False),
            "{ERROR_MARKED}": json.dumps(lang["error_marked"], ensure_ascii=False),
            "{ERROR_RENDER}": json.dumps(lang["error_render"], ensure_ascii=False),
            "{ERROR_PARSE}": json.dumps(lang["error_parse"], ensure_ascii=False),
        }

        out = template_text
        for key, value in replacements.items():
            out = out.replace(key, value)

        # Ensure no unreplaced template tokens remain.
        leftovers = sorted(set(re.findall(r"\{\{[^}]+\}\}|\{ERROR_[A-Z]+\}", out)))
        if leftovers:
            raise RuntimeError(f"Unreplaced template tokens in {md_path}: {leftovers}")

        out_path = DOCS / code / f"{slug}.html"
        out_path.write_text(out, encoding="utf-8")
        generated.append(out_path.relative_to(DOCS).as_posix())

print(f"Generated {len(generated)} HTML files:")
for item in generated:
    print(f"  docs/{item}")
PY
