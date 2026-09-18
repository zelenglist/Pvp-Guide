"""Build a faithful, offline-friendly content bundle from the original Discord exports.

Run: python -m pip install beautifulsoup4 markdown
     python scripts/build_content.py

The original HTML and assets are never modified. All text is retained in sourceText
as well as rendered Markdown, so a translation layer can always expose the original.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlparse

from bs4 import BeautifulSoup, NavigableString, Tag
import markdown


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "site"
GUILD_ID = "436125808138911784"
FILE_PATTERN = re.compile(r"┃(?P<channel>.+) \[(?P<id>\d+)\]\.html$")
DISCORD_LINK = re.compile(r"https?://(?:(?:canary|ptb)\.)?discord(?:app)?\.com/channels/\d+/(\d+)(?:/(\d+))?")
CHANNEL_MENTION = re.compile(r"<#(\d+)>")
URL_PATTERN = re.compile(r"https?://[^\s<>]+")
CHROME = ".chatlog__header, .chatlog__edited-timestamp, .chatlog__reactions, .chatlog__message-aside"
ALLOWED_TAGS = {
    "a", "p", "div", "span", "strong", "em", "b", "i", "u", "s", "del", "br", "hr",
    "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "code", "pre", "table", "thead",
    "tbody", "tr", "th", "td", "img", "video", "source", "figure", "figcaption", "section",
    "aside", "small", "sup", "sub", "details", "summary",
}


def soup_of(value: str) -> BeautifulSoup:
    return BeautifulSoup(value, "html.parser")


def rewrite_href(value: str, channels: dict, current_slug: str) -> str:
    match = DISCORD_LINK.fullmatch(value.rstrip("/"))
    if match and match[1] in channels:
        result = "#guide/" + channels[match[1]]["slug"]
        if match[2]:
            result += "/message-" + match[2]
        return result
    if value.startswith("#chatlog__message-container-"):
        return "#guide/" + current_slug + "/message-" + value.split("container-", 1)[1]
    if value.startswith("assets/"):
        return "../" + value
    return value


def friendly_internal_text(anchor, titles: dict) -> None:
    """Replace raw Discord URLs with a readable Korean label.

    build converts https://discord.com/channels/... links to internal
    #guide/... hrefs, but the visible text often remains the raw URL
    (e.g. the Category 1-12 list in the science index). Browsers still
    navigate correctly, yet users see an unfriendly URL. Swap it for the
    target document title so the Category links feel automatically connected.
    """
    text = (anchor.get_text() or "").strip()
    if "discord.com/channels" not in text and not text.startswith("https://discord"):
        return
    href = anchor.get("href", "")
    if not href.startswith("#guide/"):
        return
    parts = href[7:].split("/")
    slug = parts[0] if parts else ""
    title = titles.get(slug, slug or "관련 문서")
    if len(parts) > 1 and parts[1].startswith("message-"):
        anchor.string = title + " · 해당 위치로 이동 →"
    else:
        anchor.string = title
    classes = anchor.get("class", [])
    if isinstance(classes, str):
        classes = classes.split()
    if "internal-link" not in classes:
        anchor["class"] = classes + ["internal-link"]


def linkify(fragment: BeautifulSoup) -> None:
    for node in list(fragment.find_all(string=True)):
        if any(parent.name in {"a", "code", "pre"} for parent in node.parents):
            continue
        parts = []
        offset = 0
        for match in URL_PATTERN.finditer(str(node)):
            url = match[0].rstrip(".,;!?*")
            while url.endswith(")") and url.count(")") > url.count("("):
                url = url[:-1]
            if not url:
                continue
            parts.append(NavigableString(str(node)[offset:match.start()]))
            link = fragment.new_tag("a", href=url)
            link.string = url
            parts.append(link)
            offset = match.start() + len(url)
        if parts:
            parts.append(NavigableString(str(node)[offset:]))
            node.replace_with(*parts)


def infer_headings(text: str) -> str:
    """Promote the source's visually emphasized section labels without changing words."""
    lines = text.splitlines()
    result = []
    in_fence = False
    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
        if not in_fence:
            if re.match(r"^#{1,6}\s", stripped):
                level = 1 if stripped.startswith("# ") else 2
                line = "#" * level + " " + re.sub(r"^#{1,6}\s+", "", stripped)
            elif re.match(r"^\*{0,3}(Category|분류|카테고리)\s+\d+", stripped):
                line = "# " + stripped
            elif len(stripped) < 130 and re.search(r"\*\*__.+__\*\*|__\*\*.+\*\*__", stripped):
                # A whole-line label, not a bold phrase followed by prose.
                plain = re.sub(r"[*_`]+", "", stripped)
                if not re.search(r"[a-z].*[.!?]$", plain) and not re.search(r"__\*\*.*\w|\*\*__.*\w", stripped):
                    line = "## " + stripped
            elif re.fullmatch(r"`[A-Za-z가-힣][^`]{2,65}`", stripped):
                if not re.search(r"[=<>]|\d\s*(?:blocks|damage|armour|seconds|블록|피해|방어|초)", stripped, re.I):
                    line = "## " + stripped
        result.append(line)
    return "\n".join(result)


def render_markdown(raw: str, channels: dict, slug: str) -> BeautifulSoup:
    def mention(match):
        channel = channels.get(match[1])
        if channel:
            return f"[#{channel['channel']}](#guide/{channel['slug']})"
        return f"[#{match[1]}](https://discord.com/channels/{GUILD_ID}/{match[1]})"

    prepared = CHANNEL_MENTION.sub(mention, raw)
    # The original uses a custom empty-star emoji in risk/reward ratings.
    prepared = re.sub(r"<:star1:\d+>", "☆", prepared)
    prepared = prepared.replace("&", "&amp;").replace("<", "&lt;")
    prepared = infer_headings(prepared)
    fragment = soup_of(markdown.markdown(prepared, extensions=["extra", "nl2br", "sane_lists"]))
    for heading in fragment.find_all(re.compile(r"^h[1-6]$")):
        heading.name = "h2" if heading.name == "h1" else "h3"
        for code in heading.find_all("code"):
            code.unwrap()
    for paragraph in fragment.find_all("p"):
        if re.fullmatch(r"[.\s]+", paragraph.get_text()):
            paragraph["class"] = "content-separator"
            paragraph["aria-hidden"] = "true"
    linkify(fragment)
    return sanitize(fragment, channels, slug)


def sanitize(fragment: BeautifulSoup, channels: dict, slug: str) -> BeautifulSoup:
    for bad in fragment.select("script, style, iframe, object, embed, svg, noscript"):
        bad.decompose()
    for tag in list(fragment.find_all()):
        if tag.name not in ALLOWED_TAGS:
            tag.unwrap()
            continue
        attrs = dict(tag.attrs)
        tag.attrs = {}
        for key in ("title", "alt", "colspan", "rowspan", "aria-label", "aria-hidden"):
            if key in attrs:
                tag[key] = attrs[key]
        if "class" in attrs:
            classes = attrs["class"] if isinstance(attrs["class"], list) else attrs["class"].split()
            # Names deliberately belong to this site, not the Discord layout.
            classes = ["source-" + c[len("chatlog__"):] if c.startswith("chatlog__") else c for c in classes]
            tag["class"] = classes
        if tag.name == "a" and "href" in attrs:
            href = rewrite_href(attrs["href"], channels, slug)
            if re.match(r"^(?:https?://|mailto:|#|assets/)", href, re.I):
                tag["href"] = href
                if href.startswith(("https://", "http://", "assets/")):
                    tag["target"] = "_blank"
                    tag["rel"] = "noopener noreferrer"
        if tag.name in {"img", "source", "video"} and "src" in attrs:
            if re.match(r"^(?:https?://|assets/)", attrs["src"], re.I):
                tag["src"] = "../" + attrs["src"] if attrs["src"].startswith("assets/") else attrs["src"]
        if tag.name == "img":
            tag["loading"] = "lazy"
            tag["decoding"] = "async"
        if tag.name == "video":
            tag["controls"] = ""
            tag["preload"] = "none"
            tag["playsinline"] = ""
            if "loop" in attrs:
                tag["loop"] = ""
    return fragment


def media_from(node: Tag, message_id: str, context: str) -> list[dict]:
    media = []
    for element in node.select("video, img"):
        source = element.find("source") if element.name == "video" else element
        if not source:
            source = element
        src = source.get("src", "")
        if not src:
            continue
        caption = source.get("title") or element.get("title") or context or source.get("alt") or "자료"
        media.append({"type": "video" if element.name == "video" else "image", "src": src,
                      "caption": caption, "messageId": message_id,
                      "external": not src.startswith("assets/")})
    for link in node.select(".chatlog__attachment-generic-name a"):
        media.append({"type": "file", "src": link.get("href", ""),
                      "caption": link.get_text(" ", strip=True), "messageId": message_id,
                      "external": not link.get("href", "").startswith("assets/")})
    return media


def render_resource(node: Tag, channels: dict, slug: str, media: list[dict]) -> str:
    fragment = soup_of(str(node))
    for decorative in fragment.select(".chatlog__embed-color-pill, svg, .chatlog__attachment-spoiler-caption"):
        decorative.decompose()
    for content in list(fragment.select(".chatlog__markdown-preserve")):
        rendered = render_markdown(content.get_text(), channels, slug)
        content.clear()
        for item in list(rendered.contents):
            content.append(item)
    fragment = sanitize(fragment, channels, slug)
    wrapper = fragment.find()
    is_attachment = "chatlog__attachment" in node.get("class", [])
    if wrapper:
        wrapper.name = "figure" if media else "aside"
        wrapper["class"] = ["guide-media" if is_attachment else "resource-embed"]
        if is_attachment and media and media[0]["type"] != "file":
            caption = fragment.new_tag("figcaption")
            caption.string = media[0]["caption"]
            wrapper.append(caption)
        for video in wrapper.find_all("video"):
            source = video.find("source")
            if source and source.get("src"):
                fallback = fragment.new_tag("a", href=source["src"], target="_blank", rel="noopener noreferrer")
                fallback.string = "영상 파일 열기"
                video.append(fallback)
    return str(fragment)


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def build() -> None:
    translations = {}
    for translation_file in sorted((ROOT / "translations").glob("*.json")):
        entries = json.loads(translation_file.read_text(encoding="utf-8-sig"))
        duplicates = set(translations) & set(entries)
        if duplicates:
            raise ValueError(f"Duplicate translation IDs: {sorted(duplicates)}")
        translations.update(entries)
    catalog_text = (OUTPUT / "catalog.js").read_text(encoding="utf-8")
    titles = dict(re.findall(r"'([^']+)':\s*\{\s*title:\s*'([^']+)'", catalog_text))
    files = []
    channels = {}
    for path in sorted(ROOT.glob("*.html")):
        match = FILE_PATTERN.search(path.name)
        if not match:
            continue
        category = "science" if "PvP Science Guide" in path.name else "sword"
        info = {"id": match["id"], "channel": match["channel"], "category": category,
                "slug": category + "-" + match["channel"], "source": path.name}
        files.append((path, info))
        channels[info["id"]] = info

    articles, audits = [], []
    raw_texts, all_message_ids = [], set()
    all_media, local_refs = [], set()
    for path, info in files:
        original = path.read_text(encoding="utf-8")
        document = soup_of(original)
        containers = document.select(".chatlog__message-container")
        pieces, ko_pieces, media, authors, source_texts, messages = [], [], [], [], [], []
        text_checks, extracted_resource_count = [], 0
        author = ""
        for container in containers:
            message_id = container.get("data-message-id") or container.get("id", "").rsplit("-", 1)[-1]
            all_message_ids.add(message_id)
            primary = container.select_one(".chatlog__message-primary")
            if not primary:
                continue
            credit = primary.select_one(".chatlog__author")
            if credit:
                author = credit.get_text(strip=True)
            if author and author not in authors:
                authors.append(author)
            body_pieces, message_raw = [], []
            for content in primary.select(".chatlog__content"):
                clone = soup_of(str(content))
                for chrome in clone.select(CHROME):
                    chrome.decompose()
                raw = clone.get_text().strip()
                if not raw:
                    continue
                message_raw.append(raw)
                rendered = render_markdown(raw, channels, info["slug"])
                body_pieces.append(str(rendered))
                text_checks.append({"messageId": message_id, "sourceCharacters": len(raw),
                                    "renderedCharacters": len(rendered.get_text()), "nonEmpty": bool(rendered.get_text().strip())})
            context = normalized(" ".join(message_raw))[:160]
            for resource in primary.select(".chatlog__attachment, .chatlog__embed"):
                if resource.find_parent(class_=["chatlog__attachment", "chatlog__embed"]):
                    continue
                resource_media = media_from(resource, message_id, context)
                media.extend(resource_media)
                body_pieces.append(render_resource(resource, channels, info["slug"], resource_media))
                extracted_resource_count += 1
            # Raw body survives verbatim for audit, full-text search, and language switching.
            source_texts.extend(message_raw)
            raw_texts.extend(message_raw)
            body = "\n".join(body_pieces)
            pieces.append(f'<section class="guide-section" id="message-{message_id}" data-author="{html.escape(author, quote=True)}">{body}</section>')
            ko_body = body
            if message_raw and translations.get(message_id):
                translated = str(render_markdown(translations[message_id], channels, info["slug"]))
                resource_parts = body_pieces[len(message_raw):]
                ko_body = translated + "\n" + "\n".join(resource_parts)
            ko_fragment = soup_of(ko_body)
            for anchor in ko_fragment.select('a[href^="#guide/"]'):
                linked_slug = anchor["href"][7:].split("/")[0]
                if anchor.get_text().startswith("#") and linked_slug in titles:
                    anchor.string = titles[linked_slug]
                friendly_internal_text(anchor, titles)
            for resource_index, caption in enumerate(ko_fragment.select("figcaption"), 1):
                caption.string = f"{titles.get(info['slug'], info['channel'])} · 참고 자료 {resource_index}"
            for img in ko_fragment.select("img"):
                img["alt"] = f"{titles.get(info['slug'], info['channel'])} 참고 도표 — 확대해서 보기"
            ko_pieces.append(f'<section class="guide-section" id="message-{message_id}" data-author="{html.escape(author, quote=True)}">{ko_fragment}</section>')
            messages.append({"id": message_id, "author": author, "sourceText": "\n\n".join(message_raw)})

        complete = soup_of("\n".join(pieces))
        for anchor in complete.select('a[href^="#guide/"]'):
            friendly_internal_text(anchor, titles)
        headings = []
        for index, heading in enumerate(complete.select("h2, h3"), 1):
            heading["id"] = "section-" + str(index)
            headings.append({"id": heading["id"], "text": heading.get_text(" ", strip=True), "level": int(heading.name[1])})
        for element in complete.select("[src], a[href]"):
            value = element.get("src") or element.get("href")
            if value.startswith("../assets/"):
                local_refs.add(value)
        article = dict(info, title=info["channel"], html=str(complete),
                       text=complete.get_text(" ", strip=True), sourceText="\n\n".join(source_texts),
                       headings=headings, media=media, authors=authors, messageCount=len(containers),
                       language="en", sourceLanguage="en", messages=messages)
        ko_complete = soup_of("\n".join(ko_pieces))
        for anchor in ko_complete.select('a[href^="#guide/"]'):
            friendly_internal_text(anchor, titles)
        ko_headings = []
        for heading_index, heading in enumerate(ko_complete.select("h2, h3"), 1):
            heading["id"] = "section-" + str(heading_index)
            ko_headings.append({"id": heading["id"], "text": heading.get_text(" ", strip=True), "level": int(heading.name[1])})
        text_ids = [m["id"] for m in messages if m["sourceText"].strip()]
        article.update(htmlKo=str(ko_complete), textKo=ko_complete.get_text(" ", strip=True), headingsKo=ko_headings,
                       translatedCount=sum(bool(translations.get(mid)) for mid in text_ids), textMessageCount=len(text_ids),
                       translated=all(bool(translations.get(mid)) for mid in text_ids),
                       readingMinutes=max(1, round(len(ko_complete.get_text()) / 500)))
        articles.append(article)
        all_media.extend(media)
        original_meaningful = soup_of(str(document.select_one(".chatlog")))
        for chrome in original_meaningful.select(CHROME):
            chrome.decompose()
        source_media = Counter(("video" if tag.name == "source" else "image", tag.get("src", ""))
                               for tag in original_meaningful.select("video source, img"))
        output_media = Counter((item["type"], item["src"]) for item in media if item["type"] != "file")
        original_resources = len(document.select(".chatlog__attachment, .chatlog__embed"))
        audits.append({"source": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                       "slug": info["slug"], "sourceMessageCount": len(containers),
                       "outputMessageCount": len(complete.select("section.guide-section")),
                       "sourceResourceCount": original_resources, "outputResourceCount": extracted_resource_count,
                       "sourceMediaCount": sum(source_media.values()), "outputMediaCount": sum(output_media.values()),
                       "sourceBodyCount": len(source_texts), "outputBodyCount": len(text_checks),
                       "verbatimSourceRetained": all(message["sourceText"] in article["sourceText"] for message in messages),
                       "missingMedia": list((source_media - output_media).elements()),
                       "bodyChecks": text_checks})

    missing_local = sorted(ref for ref in local_refs if not (OUTPUT / unquote(urlparse(ref).path)).is_file())
    unresolved_internal = []
    external_discord = set()
    article_by_slug = {article["slug"]: article for article in articles}
    for article in articles:
        for link in soup_of(article["html"]).select("a[href]"):
            href = link["href"]
            if href.startswith("#guide/"):
                parts = href[7:].split("/", 1)
                if parts[0] not in article_by_slug or (len(parts) > 1 and parts[1].startswith("message-") and parts[1][8:] not in all_message_ids):
                    unresolved_internal.append({"source": article["slug"], "href": href})
            elif DISCORD_LINK.match(href):
                external_discord.add(href)
    counts = Counter(item["type"] for item in all_media)
    stats = {"articles": len(articles), "messages": sum(a["messageCount"] for a in articles),
             "textMessages": len(raw_texts), "videos": counts["video"], "images": counts["image"],
             "files": counts["file"], "media": len(all_media), "localAssets": len(local_refs),
             "headings": sum(len(a["headings"]) for a in articles),
             "sourceCharacters": sum(len(text) for text in raw_texts),
             "categories": dict(Counter(a["category"] for a in articles))}
    audit = {"stats": stats, "sourceEncoding": "UTF-8", "originalFilesModified": False,
             "missingLocalReferences": missing_local, "unresolvedInternalReferences": unresolved_internal,
             "externalDiscordReferences": sorted(external_discord),
             "externalMedia": [m for m in all_media if m["external"]],
             "emptySourceArticles": [a["slug"] for a in articles if not a["messageCount"]],
             "articles": audits}
    audit["passed"] = (not missing_local and all(a["sourceMessageCount"] == a["outputMessageCount"]
                       and a["sourceResourceCount"] == a["outputResourceCount"] and not a["missingMedia"]
                       and a["verbatimSourceRetained"] and all(c["nonEmpty"] for c in a["bodyChecks"]) for a in audits))
    missing_translations = [{"slug": a["slug"], "messageId": m["id"]} for a in articles for m in a["messages"]
                            if m["sourceText"].strip() and not translations.get(m["id"])]
    stats["translatedMessages"] = sum(a["translatedCount"] for a in articles)
    stats["translatedArticles"] = sum(a["translated"] and bool(a["textMessageCount"]) for a in articles)
    audit["translation"] = {"complete": not missing_translations, "missing": missing_translations,
                            "translatedMessages": stats["translatedMessages"]}
    OUTPUT.mkdir(exist_ok=True)
    encoded = json.dumps({"articles": articles, "stats": stats}, ensure_ascii=False, separators=(",", ":"))
    (OUTPUT / "content.js").write_text("/* Generated by scripts/build_content.py; original source text preserved. */\nwindow.PVP_CONTENT = " + encoded.replace("</", "<\\/") + ";\n", encoding="utf-8")
    (OUTPUT / "content-audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": audit["passed"], "stats": stats, "missingLocalReferences": missing_local,
                      "unresolvedInternalReferences": unresolved_internal,
                      "externalMediaCount": len(audit["externalMedia"]), "emptySourceArticles": audit["emptySourceArticles"]}, ensure_ascii=False, indent=2))
    if not audit["passed"]:
        raise SystemExit("Content completeness audit failed; inspect site/content-audit.json")


if __name__ == "__main__":
    build()
