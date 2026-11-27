"""Generate a Flow from a brief: what is sent to the AI, and how its answer is checked. Server side only.

Sent: the brief and the draft the user typed, the Department names and descriptions, the Function titles and descriptions, and the names of
the Sheets and Apps on the map. Never sent: member names or emails, tickets, time logs, documentation links, other flows, removed entries, other maps.
Every text is also stripped of email addresses and ticket ids before it leaves.
"""
import json, os, re
import ai

EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
TICKET = re.compile(r"\b[A-Z]{1,2}\d{8}\.\d{2,4}\b")   # such as T20261112.001
MAX_STEPS, MAX_TEAMS, MAX_NOTES = 40, 12, 8
KINDS = ("step", "start", "end", "decision")
DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
CHARTS = ("swimlane", "flowchart", "waterfall", "entity")

SYSTEM = """You turn a short description into a diagram, as JSON only (no prose, no code fences). First choose the chart type that suits it best:
- "swimlane": a process where work is handed over between several teams (a lane per team).
- "flowchart": a process run by one person or team, with steps and yes/no decisions, in one column.
- "waterfall": phases or stages that run one after another, each starting when the previous one ends.
- "entity": things and how they relate (a data model): each step is an entity, and the arrows are relationships.
Shape:
{"chart": "swimlane", "reason": "one short sentence on why this chart type", "teams": ["Sales", "Finance"],
 "steps": [{"team": "Sales", "title": "Send the quote", "kind": "start|step|decision|end", "day": null, "sheet": null, "note": "",
            "waits": [{"on": 0, "msg": "what is handed over"}]}],
 "notes": [{"text": "an assumption or open question", "step": null}]}
For an "entity" chart each step is an entity: "title" is its name, "lines" is a list of its fields or a short description (at most 8 lines), "team" is not needed, "kind" is not used, and each "waits" entry is a relationship to an earlier entity, with "msg" such as "1 to many".
Rules:
- Use at most 40 steps and 12 teams. For swimlane a step belongs to the team that does it; prefer the Department names given. For flowchart and waterfall still name a team (or "General").
- "waits" lists the earlier steps (by 0-based index) this step waits on. Every step except the first and any second start should wait on at least one earlier step. "on" must be smaller than the step's own index.
- Mark the first step "start" and the last "end" only when the description makes the beginning and end clear. A "decision" step is a yes/no question; its outgoing arrows (steps that wait on it) use the msg "Yes" and "No".
- "sheet" must be copied exactly from the list of sheets and apps you are given, or null. Never invent a sheet.
- Do not guess. Put anything you assumed, and any question the description leaves open, into "notes" (use "step" for the step index it is about, or null).
- Keep titles short. Use the user's language."""

SYSTEM_EDIT = """You edit an existing business-process flow diagram, as JSON only (no prose, no code fences).
You get the current flow (its steps are numbered from 0, each with the steps it waits on), the user's instruction, and the sheets and apps on the map.
Answer with the COMPLETE flow after the change, in this shape:
{"chart": "swimlane", "reason": "one short sentence", "summary": "what you changed, in one sentence", "teams": ["Sales", "Finance"],
 "steps": [{"was": 0, "team": "Sales", "title": "Send the quote", "kind": "start|step|decision|end", "day": null, "sheet": null, "note": "",
            "waits": [{"on": 0, "msg": "what is handed over"}]}],
 "notes": [{"text": "an assumption or open question", "step": null}]}
Rules:
- "was" is the number the step has in the CURRENT flow. Every step you keep must have its "was" and keep its words unless the instruction asks to change them. A step with no "was" (or null) is new. A current step you leave out is deleted. Keep the kept steps in their current order.
- "waits" are the steps this step waits on, by 0-based index in YOUR new list (not the old numbers); "on" must be smaller than the step's own index. Keep existing arrows unless the instruction changes them. A decision's outgoing arrows use the msg "Yes" and "No".
- At most 40 steps and 12 teams. "sheet" must be copied exactly from the list given, or null; never invent one.
- If the current flow is a free canvas (it says so), there are no lanes and no "earlier": a step may wait on ANY other step, before or after it in your list ("on" just must not be its own index). An entity diagram's steps are entities: keep "title" as the name and give the description as "lines" (a list), and arrows are relationships whose "msg" is such as "1 to many".
- "notes" are only NEW notes (assumptions, open questions). Do not repeat notes that already exist.
- Change only what the instruction asks for. If it is unclear, change nothing and say so in "summary"."""


def clean(text):
    """Strip what must never leave: email addresses and ticket ids."""
    return TICKET.sub("[ticket]", EMAIL.sub("[email removed]", str(text or "")))


def map_context(root, map_id):
    """Department, Function and sheet names from the Data file. Returns {'departments': [...], 'sheets': [...]}; empty if there is no file."""
    name = re.sub(r"\.json$", "", str(map_id or ""))
    if not re.match(r"^[\w-][\w.-]*$", name):
        return {"departments": [], "sheets": []}
    path = os.path.join(root, "data", name + ".json")
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        return {"departments": [], "sheets": []}
    deps = []
    for dep in d.get("departments") or []:
        fns = [{"title": clean(s.get("title") or ""), "note": clean(s.get("note") or "")} for s in dep.get("sections") or [] if (s.get("title") or s.get("note"))]
        deps.append({"name": clean(dep.get("name") or ""), "text": [clean(t) for t in dep.get("text") or []], "functions": fns})
    sheets = [clean(s.get("name") or "") for s in d.get("sheets") or [] if s.get("name")]
    return {"departments": deps, "sheets": sheets}


def build_user_message(title, brief, draft, ctx):
    out = ["Flow title: " + clean(title), "", "Brief:", clean(brief) or "(none)", "", "Rough draft of the steps:", clean(draft) or "(none)"]
    if ctx["departments"]:
        out += ["", "Departments and what they do:"]
        for d in ctx["departments"]:
            out.append("- " + d["name"] + (": " + " ".join(d["text"]) if d["text"] else ""))
            for f in d["functions"]:
                out.append("    * " + f["title"] + (": " + f["note"] if f["note"] else ""))
    out += ["", "Sheets and apps on the map (use these names exactly, or null):", ", ".join(ctx["sheets"]) or "(none)"]
    return "\n".join(out)


def _multi(v, limit):
    """Text that keeps its line breaks (an entity's description lines), each line tidied and the whole cut to a limit."""
    return "\n".join(re.sub(r"[ \t]+", " ", l).strip() for l in v.split("\n") if l.strip())[:limit] if isinstance(v, str) else ""


def _text(v, limit):
    return re.sub(r"\s+", " ", v).strip()[:limit] if isinstance(v, str) else ""


def _lines(v):
    """An entity's description lines: a list of short texts, one per line (a single text is split on line breaks)."""
    items = v if isinstance(v, list) else (v.split("\n") if isinstance(v, str) else [])
    return "\n".join(re.sub(r"\s+", " ", x).strip()[:80] for x in items[:8] if isinstance(x, str) and x.strip())


def parse_answer(raw, sheet_names, current_count=None, free=False):
    """The AI's reply -> a checked flow, or AiError. Unknown sheet names are kept as plain text and listed in 'unknownSheets'."""
    s = raw.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", s, re.S)
    if m: s = m.group(1).strip()
    if not s.startswith("{"):
        a, b = s.find("{"), s.rfind("}")
        s = s[a:b + 1] if 0 <= a < b else s
    try:
        j = json.loads(s)
    except ValueError:
        raise ai.AiError("The AI did not answer with a flow I can read. Nothing was changed; try again.")
    if not isinstance(j, dict) or not isinstance(j.get("steps"), list) or not j["steps"]:
        raise ai.AiError("The AI's answer had no steps. Nothing was changed; try again or add more detail to the brief.")
    if len(j["steps"]) > MAX_STEPS:
        raise ai.AiError("The AI made %d steps; the limit is %d. Nothing was changed; ask for a smaller flow." % (len(j["steps"]), MAX_STEPS))
    chart = j.get("chart") if j.get("chart") in CHARTS else "swimlane"
    known = {n.lower(): n for n in sheet_names}
    teams, steps, unknown = [], [], []
    for i, st in enumerate(j["steps"]):
        if not isinstance(st, dict): raise ai.AiError("The AI's step %d was not understood. Nothing was changed." % (i + 1))
        entity = chart == "entity" and not current_count
        team, title = _text(st.get("team"), 60) or ("General" if (entity or free) else ""), _text(st.get("title"), 140)
        if not team or not title: raise ai.AiError("The AI's step %d has no team or no title. Nothing was changed." % (i + 1))
        if team.lower() not in [t.lower() for t in teams]: teams.append(team)
        kind = "step" if entity else (st.get("kind") if st.get("kind") in KINDS else "step")
        waits = []
        for w in st.get("waits") or []:
            on = w.get("on") if isinstance(w, dict) else None
            if isinstance(on, int) and not isinstance(on, bool) and ((0 <= on < len(j["steps"]) and on != i) if free else 0 <= on < i) and on not in [x["on"] for x in waits]:
                waits.append({"on": on, "msg": _text(w.get("msg"), 80)})
        was = st.get("was")
        was = was if current_count and isinstance(was, int) and not isinstance(was, bool) and 0 <= was < current_count and was not in [x.get("was") for x in steps] else None
        sheet, sheet_name = None, None
        raw_sheet = _text(st.get("sheet"), 100)
        if raw_sheet:
            if raw_sheet.lower() in known: sheet = known[raw_sheet.lower()]
            else: sheet_name = raw_sheet; unknown.append(raw_sheet)
        omit = ()
        if current_count: omit = tuple(k for k in ("kind", "day", "note", "sheet") if k not in st and not (k == "note" and "lines" in st))   # in an edit, a field the AI left out means "unchanged"
        item = ({"was": was, "team": team, "title": title, "kind": kind if current_count else (None if kind == "step" else kind), "day": st.get("day") if st.get("day") in DAYS else None,
                      "sheet": sheet, "sheetName": sheet_name, "note": (_lines(st.get("lines")) if (entity or (current_count and "lines" in st)) else _text(st.get("note"), 400)), "waits": waits})
        for k in omit: item.pop(k, None); item.pop("sheetName", None) if k == "sheet" else None
        steps.append(item)
    if len(teams) > MAX_TEAMS:
        raise ai.AiError("The AI used %d teams; the limit is %d. Nothing was changed; ask for fewer teams." % (len(teams), MAX_TEAMS))
    notes = []
    for n in (j.get("notes") or [])[:MAX_NOTES]:
        text = _text(n.get("text") if isinstance(n, dict) else None, 300)
        at = n.get("step") if isinstance(n, dict) else None
        if text: notes.append({"text": text, "step": at if isinstance(at, int) and not isinstance(at, bool) and 0 <= at < len(steps) else None})
    return {"chart": chart, "reason": _text(j.get("reason"), 200), "teams": teams, "steps": steps, "notes": notes, "summary": _text(j.get("summary"), 300), "unknownSheets": sorted(set(unknown))}


def current_flow(raw):
    """The flow the page says is open, reduced to the fields the AI needs. Anything else (tickets, ids, positions, arrows sent back) is dropped."""
    free = isinstance(raw, dict) and raw.get("layout") == "free"
    if not isinstance(raw, dict) or not isinstance(raw.get("steps"), list) or not raw["steps"] or len(raw["steps"]) > MAX_STEPS:
        raise ai.AiError("There is no flow to change yet. Use Generate flow on an empty flow first.")
    steps = []
    for i, st in enumerate(raw["steps"]):
        if not isinstance(st, dict): raise ai.AiError("The flow could not be read.")
        waits = [{"on": w["on"], "msg": clean(_text(w.get("msg"), 80))} for w in (st.get("waits") or []) if isinstance(w, dict) and isinstance(w.get("on"), int) and not isinstance(w.get("on"), bool) and ((0 <= w["on"] < len(raw["steps"]) and w["on"] != i) if free else 0 <= w["on"] < i)]
        steps.append({"n": i, "team": clean(_text(st.get("team"), 60)), "title": clean(_text(st.get("title"), 140)), "kind": st.get("kind") if st.get("kind") in KINDS else "step",
                      "day": st.get("day") if st.get("day") in DAYS else None, "sheet": clean(_text(st.get("sheet"), 100)) or None, "note": clean(_multi(st.get("note"), 400)), "waits": waits})
    return steps, free


def generate(root, map_id, title, brief, draft, instruction=None, flow=None):
    """The whole request. Returns {'ok': True, 'flow': ..., 'provider': ...} or {'ok': False, 'error': ...}. Never raises.
    With an instruction it edits the flow the page sent instead of making one from the brief."""
    cfg, problem = ai.load_config(root)
    if not cfg: return {"ok": False, "error": problem}
    try:
        brief, draft, title = (x if isinstance(x, str) else "" for x in (brief, draft, title))
        ctx = map_context(root, map_id)
        if instruction is not None:
            if not isinstance(instruction, str) or not instruction.strip(): raise ai.AiError("Type the change you want first.")
            ai.check_length(instruction=instruction, brief=brief)
            cur, free = current_flow(flow)
            user = build_user_message(title, brief, "", ctx) + ("\n\nThe current flow is a FREE CANVAS (no lanes; arrows may point in any direction)." if free else "") + "\n\nCurrent flow (JSON):\n" + json.dumps(cur, ensure_ascii=False) + "\n\nInstruction:\n" + clean(instruction)
            raw = ai.complete(cfg, SYSTEM_EDIT, user, max_tokens=ai.MAX_OUT_TOKENS)
            return {"ok": True, "flow": parse_answer(raw, ctx["sheets"], len(cur), free), "provider": cfg["provider"], "label": cfg["label"]}
        if not brief.strip() and not draft.strip(): raise ai.AiError("Write a brief or a rough draft first, so the AI has something to work from.")
        ai.check_length(brief=brief, draft=draft)
        raw = ai.complete(cfg, SYSTEM, build_user_message(title, brief, draft, ctx), max_tokens=ai.MAX_OUT_TOKENS)
        return {"ok": True, "flow": parse_answer(raw, ctx["sheets"]), "provider": cfg["provider"], "label": cfg["label"]}
    except ai.AiError as e:
        return {"ok": False, "error": str(e)}
