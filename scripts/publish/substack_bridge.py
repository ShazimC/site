"""Substack bridge for cli.ts (named to avoid shadowing the `substack` package). Reads one JSON request on stdin, writes one JSON response on stdout.

Requests:
  {"action": "upsert", "title", "subtitle", "slug", "markdown", "draft_id"?, "revision"?, "force"?}
  {"action": "status", "draft_ids": [..]}
"""

import json
import os
import sys

from substack import Api
from substack.post import Post
from substack.revision import compute_draft_revision

# Must match SUBSTACK_LINE_BREAK in convert.ts. python-substack turns hard breaks into spaces.
LINE_BREAK = "\u2028"


class Conflict(Exception):
    pass


def connect() -> Api:
    cookies = os.environ.get("SUBSTACK_COOKIES")
    publication = os.environ.get("SUBSTACK_PUBLICATION_URL")
    if not cookies or not publication:
        raise RuntimeError("Set SUBSTACK_COOKIES and SUBSTACK_PUBLICATION_URL in scripts/publish/.env")
    return Api(cookies_string=cookies, publication_url=publication)


def publication_url() -> str:
    return os.environ["SUBSTACK_PUBLICATION_URL"].rstrip("/")


def restore_line_breaks(node: dict) -> None:
    content = node.get("content")
    if not content:
        return
    out = []
    for child in content:
        if child.get("type") == "text" and LINE_BREAK in child.get("text", ""):
            for i, part in enumerate(child["text"].split(LINE_BREAK)):
                if i:
                    out.append({"type": "hard_break"})
                if part:
                    out.append({**child, "text": part})
        else:
            restore_line_breaks(child)
            out.append(child)
    node["content"] = out


def render(api: Api, req: dict) -> Post:
    post = Post(title=req["title"], subtitle=req.get("subtitle", ""), user_id=api.get_user_id())
    post.from_markdown(req["markdown"], api=api)
    restore_line_breaks(post.draft_body)
    return post


def revision(draft: dict) -> str:
    return compute_draft_revision(draft)["revision"]


def describe(draft: dict) -> dict:
    draft_id = draft["id"]
    if draft.get("is_published"):
        return {"status": "published", "draft_id": draft_id, "url": f"{publication_url()}/p/{draft.get('slug')}"}
    return {
        "status": "draft",
        "draft_id": draft_id,
        "revision": revision(draft),
        "url": f"{publication_url()}/publish/post/{draft_id}",
    }


def upsert(req: dict) -> dict:
    api = connect()
    draft_id = req.get("draft_id")
    metadata = {
        "draft_title": req["title"],
        "draft_subtitle": req.get("subtitle", ""),
        "search_engine_description": req.get("subtitle") or None,
        "slug": req.get("slug"),
    }
    metadata = {key: value for key, value in metadata.items() if value is not None}

    if draft_id:
        current = api.get_draft(draft_id)
        if current.get("is_published"):
            return {**describe(current), "skipped": "Already published on Substack; edit it there."}
        if req.get("revision") and revision(current) != req["revision"] and not req.get("force"):
            raise Conflict("The Substack draft was edited in Substack since the last sync. Re-run with --force to overwrite it.")
        post = render(api, req)
        api.put_draft(draft_id, draft_body=json.dumps(post.draft_body), **metadata)
    else:
        post = render(api, req)
        draft_id = api.post_draft(post.get_draft())["id"]
        api.put_draft(draft_id, **metadata)

    return describe(api.get_draft(draft_id))


def status(req: dict) -> dict:
    api = connect()
    results = {}
    for draft_id in req["draft_ids"]:
        try:
            results[str(draft_id)] = describe(api.get_draft(draft_id))
        except Exception as error:  # noqa: BLE001 - one missing draft shouldn't fail the batch
            results[str(draft_id)] = {"status": "missing", "error": str(error)}
    return {"results": results}


def main() -> None:
    req = json.load(sys.stdin)
    try:
        result = {"upsert": upsert, "status": status}[req["action"]](req)
        print(json.dumps({"ok": True, **result}))
    except Exception as error:  # noqa: BLE001 - reported to the caller as JSON
        print(json.dumps({"ok": False, "error": str(error), "conflict": isinstance(error, Conflict)}))


if __name__ == "__main__":
    main()
