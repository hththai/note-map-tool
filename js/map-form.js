/* Edit the map with a form instead of Markdown: click a card, section or department on the map and change it here.
 * Every change edits the parsed model, writes it back to the Markdown text (serialize.js) and redraws the map.
 * Redrawing parses the text again, so handlers never keep model objects: they look the item up again when they run.
 * Saving stays with the Save button in editor.js. */
(function(App){
  var S = App.S, $ = App.$, el = App.el;
  var root = $('mform'), ed = $('ed'), checked = false, skipFill = false, forceFill = false, filledKey = null, wantFocus = false, moreOpen = false;
  var HOWS = ['IMPORTRANGE', 'manual copy', 'connector', 'CSV import', 'Apps Script'];
  var addDir = 'to', addHow = '';

  function active(){ return !$('editor').hidden && !root.hidden; }
  function say(t){ $('status').textContent = t || ''; }
  function clean(v){ return String(v).replace(/[|\r\n]/g, ' ').trim(); }
  function secKey(di, si){ return 'sec:' + di + ':' + si; }
  function sheetNames(){
    var r = [];
    S.model.depts.forEach(function(d){ App.deptNodes(d).forEach(function(n){ r.push(n.name); }); });
    S.model.apps.forEach(function(n){ r.push(n.name); });
    return r;
  }
  function unique(base){
    var n = base, i = 1;
    while (S.nodeEls[n.toLowerCase()]) n = base + ' ' + (++i);
    return n;
  }
  function newNode(kind, name, dept){
    return { name: name, key: name.toLowerCase(), kind: kind, url: null, crit: null, details: '', parts: [], note: '', dept: dept };
  }

  /* where a card, section or department sits in the model */
  function whereNode(n){
    var d, s, i;
    for (d = 0; d < S.model.depts.length; d++) for (s = 0; s < S.model.depts[d].sections.length; s++) {
      i = S.model.depts[d].sections[s].nodes.indexOf(n);
      if (i >= 0) return { list: S.model.depts[d].sections[s].nodes, i: i, di: d, si: s };
    }
    i = S.model.apps.indexOf(n);
    return i >= 0 ? { list: S.model.apps, i: i } : null;
  }
  function whereSec(sc){
    for (var d = 0; d < S.model.depts.length; d++) { var i = S.model.depts[d].sections.indexOf(sc); if (i >= 0) return { di: d, si: i }; }
    return null;
  }
  /* a card's place by position, so it is found again after the model is parsed anew (names may repeat while typing) */
  function placeOf(n){ var w = whereNode(n); return w.di == null ? { i: w.i } : { di: w.di, si: w.si, i: w.i }; }
  function nodeAt(p){ return p.di == null ? S.model.apps[p.i] : S.model.depts[p.di].sections[p.si].nodes[p.i]; }

  /* ---------- undo ---------- */
  var undo = [], redo = [], lastAt = 0, lastKeep = false, uBtn = null, rBtn = null;
  function snap(){
    return { text: ed.value, sel: S.selected, tix: S.tdata.tickets.map(function(t){ return [t.id, t.target]; }) };
  }
  function syncHist(){
    if (uBtn) uBtn.disabled = !undo.length;
    if (rBtn) rBtn.disabled = !redo.length;
  }
  function travel(from, to){
    if (!from.length) return;
    var s = from.pop(), moved = false;
    to.push(snap());
    ed.value = s.text;
    s.tix.forEach(function(p){
      S.tdata.tickets.forEach(function(t){ if (t.id === p[0] && t.target !== p[1]) { t.target = p[1]; moved = true; } });
    });
    App.render(s.text);
    if (moved) retargeted();
    lastKeep = false; forceFill = true;
    say('Unsaved changes. Press Save to keep them.');
    App.select(s.sel && S.items[s.sel] ? s.sel : null);
    syncHist();
  }
  function doUndo(){ travel(undo, redo); }
  function doRedo(){ travel(redo, undo); }
  /* anywhere on the map or in the form, but not in the Markdown box or other inputs */
  document.addEventListener('keydown', function(ev){
    if (!(ev.metaKey || ev.ctrlKey) || ev.altKey || !active() || $('mapView').hidden) return;
    var t = ev.target, k = ev.key.toLowerCase();
    if (!(root.contains(t) || $('map').contains(t) || t === document.body)) return;
    if (k === 'z') { ev.preventDefault(); if (ev.shiftKey) doRedo(); else doUndo(); }
    else if (k === 'y') { ev.preventDefault(); doRedo(); }
  });

  /* run one change: confirm once if the file holds things the form would lose, edit the model, write it back, redraw.
   * fn gets the model and may return the key to select afterwards (null = nothing). opts.keep leaves the form alone so typing is not interrupted. */
  function edit(fn, opts){
    var keep = !!(opts && opts.keep);
    if (!checked) {
      if (App.mapLossy(ed.value) && !confirm('This file has comments or lines the form cannot keep. Editing here will drop them (the previous file is kept as ' + S.param + '.bak once you save). Continue?')) { fill(); return; }
      checked = true;
    }
    /* keystrokes in one field within a second are one undo step */
    var now = Date.now();
    if (!(keep && lastKeep && now - lastAt < 1000)) { undo.push(snap()); if (undo.length > 100) undo.shift(); redo = []; }
    lastAt = now; lastKeep = keep;
    var r = fn(S.model), text = App.stringify(S.model);
    ed.value = text;
    say('Unsaved changes. Press Save to keep them.');
    App.render(text);
    skipFill = keep; forceFill = !keep;
    App.select(r === undefined ? null : r);
    skipFill = false;
    if (keep) filledKey = S.selected;
    syncHist();
  }

  function dropLinks(name){
    var key = name.toLowerCase(), before = S.model.links.length;
    S.model.links = S.model.links.filter(function(l){ return l.from.toLowerCase() !== key && l.to.toLowerCase() !== key; });
    return before - S.model.links.length;
  }
  function renameNode(n, v){
    var oldKey = n.key, key = v.toLowerCase(), moved = false;
    S.model.links.forEach(function(l){
      if (l.from.toLowerCase() === oldKey) l.from = v;
      if (l.to.toLowerCase() === oldKey) l.to = v;
    });
    S.tdata.tickets.forEach(function(t){ if (t.target === oldKey) { t.target = key; moved = true; } });
    n.name = v; n.key = key;
    if (moved) retargeted();
  }
  /* ticket targets were renamed: redraw the board and save once typing pauses */
  var tixTimer = null;
  function retargeted(){
    App.renderBoard();
    clearTimeout(tixTimer); tixTimer = setTimeout(App.saveTickets, 600);
  }
  function removeNode(n){
    var w = whereNode(n), gone = dropLinks(n.name);
    w.list.splice(w.i, 1);
    if (gone) say(gone + ' link' + (gone > 1 ? 's' : '') + ' to ' + n.name + ' removed.');
  }
  function shift(list, i, d, key){
    var j = i + d;
    if (j < 0 || j >= list.length) return;
    edit(function(){ var t = list[i]; list[i] = list[j]; list[j] = t; return typeof key === 'function' ? key(j) : key; });
  }

  /* ---------- small form pieces ---------- */
  function field(label, input){
    var l = el('label', null, label); l.appendChild(input); return l;
  }
  function text(value, onChange, type){
    var i = el('input'); i.type = type || 'text'; i.value = value || '';
    i.addEventListener('input', function(){ onChange(i.value); });
    return i;
  }
  function area(value, onChange, rows){
    var a = el('textarea'); a.value = value || ''; a.rows = rows || 3; a.spellcheck = true;
    a.addEventListener('input', function(){ onChange(a.value); });
    return a;
  }
  function btn(label, fn, extra, tip){
    var b = el('button', 'btn' + (extra ? ' ' + extra : ''), label); b.type = 'button';
    if (/\boff\b/.test(extra || '')) b.disabled = true;
    if (tip) { b.title = tip; b.setAttribute('aria-label', tip); }
    b.addEventListener('click', fn); return b;
  }
  function row(){ var r = el('div', 'mrow'); Array.prototype.slice.call(arguments).forEach(function(c){ if (c) r.appendChild(c); }); return r; }
  function select(options, value, onChange){
    var s = el('select');
    options.forEach(function(o){ var op = el('option', null, o.label); op.value = o.value; if (o.value === value) op.selected = true; s.appendChild(op); });
    s.addEventListener('change', function(){ onChange(s.value); });
    return s;
  }
  /* title on the left, move and delete buttons on the right */
  function head(title, up, down, del){
    var h = el('div', 'mhead');
    h.appendChild(el('h3', null, title));
    var t = el('div', 'mtools');
    t.appendChild(btn('↑', up.fn, 'sm' + (up.off ? ' off' : ''), 'Move up'));
    t.appendChild(btn('↓', down.fn, 'sm' + (down.off ? ' off' : ''), 'Move down'));
    t.appendChild(btn('Delete', del, 'sm danger'));
    h.appendChild(t);
    return h;
  }

  /* ---------- sheet or app ---------- */
  function nodeForms(key0){
    var p = placeOf(S.items[key0]), isApp = p.di == null;
    function N(){ return nodeAt(p); }
    function chg(fn, opts){ edit(function(){ var n = N(); fn(n); return n.key; }, opts); }
    var n0 = N(), f = el('div', 'mbox');
    f.appendChild(head(isApp ? 'Connected app' : 'Sheet in ' + (n0.dept || ''),
      { fn: function(){ var n = N(), w = whereNode(n); shift(w.list, w.i, -1, n.key); }, off: p.i === 0 },
      { fn: function(){ var n = N(), w = whereNode(n); shift(w.list, w.i, 1, n.key); }, off: p.i === whereNode(n0).list.length - 1 },
      function(){ edit(function(){ removeNode(N()); return null; }); }));

    var name = text(n0.name, function(v){
      if (!clean(v)) return;
      edit(function(){ var n = N(); renameNode(n, clean(v)); return n.key; }, { keep: true });
      refreshLinks();
    });
    name.id = 'mfName';
    name.addEventListener('keydown', function(ev){
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      edit(function(){
        var n = N(), w = whereNode(n), nn = newNode(isApp ? 'app' : 'sheet', unique(isApp ? 'New app' : 'New sheet'), isApp ? null : n.dept);
        w.list.splice(w.i + 1, 0, nn); wantFocus = true;
        return nn.key;
      });
    });
    f.appendChild(field('Name', name));
    f.appendChild(field(isApp ? 'What it does' : 'Owner', text(n0.details, function(v){
      chg(function(n){ n.details = clean(v); n.parts = n.details ? [n.details] : []; }, { keep: true });
    })));
    var cr = el('div', 'seg'); cr.setAttribute('role', 'group'); cr.setAttribute('aria-label', 'Criticality');
    [['', 'None'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']].forEach(function(c){
      var b = el('button', null, c[1]); b.type = 'button'; b.setAttribute('aria-pressed', String((n0.crit || '') === c[0]));
      b.addEventListener('click', function(){ chg(function(n){ n.crit = c[0] || null; }); });
      cr.appendChild(b);
    });
    f.appendChild(el('div', 'lbl', 'Criticality')); f.appendChild(cr);
    f.appendChild(el('p', 'hint', 'Press Enter in Name to add another ' + (isApp ? 'app' : 'sheet') + ' below.'));

    var more = el('details', 'more');
    more.open = moreOpen || !!(n0.url || n0.note);
    var sum = el('summary', null, 'More: link, note' + (isApp ? '' : ', move'));
    sum.addEventListener('click', function(){ moreOpen = !more.open; });
    more.appendChild(sum);
    more.appendChild(field('Link (URL)', text(n0.url, function(v){
      chg(function(n){ n.url = /^https?:\/\//i.test(v.trim()) ? clean(v) : null; }, { keep: true });
    }, 'url')));
    more.appendChild(field('Note', area(n0.note, function(v){ chg(function(n){ n.note = v.trim(); }, { keep: true }); }, 4)));
    if (!isApp) {
      var opts = [];
      S.model.depts.forEach(function(d, di){ d.sections.forEach(function(sc, si){ opts.push({ value: di + ':' + si, label: d.name + (sc.title ? ' › ' + sc.title : '') }); }); });
      more.appendChild(field('Move to', select(opts, p.di + ':' + p.si, function(v){
        var q = v.split(':'), to = S.model.depts[+q[0]];
        edit(function(){ var n = N(); whereNode(n).list.splice(whereNode(n).i, 1); to.sections[+q[1]].nodes.push(n); n.dept = to.name; return n.key; });
      })));
    }
    return [f, linksBox(), more];
  }

  /* ---------- section ---------- */
  function sectionForms(di, si){
    function D(){ return S.model.depts[di]; }
    function SC(){ return D().sections[si]; }
    var dp = D(), sc = SC(), f = el('div', 'mbox');
    var prevPlain = si > 0 && dp.sections[si - 1].title == null;
    f.appendChild(head('Section in ' + dp.name,
      { fn: function(){ shift(D().sections, si, -1, function(j){ return secKey(di, j); }); }, off: si === 0 || prevPlain },
      { fn: function(){ shift(D().sections, si, 1, function(j){ return secKey(di, j); }); }, off: si === dp.sections.length - 1 },
      function(){
        var s = SC();
        if (s.nodes.length && !confirm('Delete this section and its ' + s.nodes.length + ' sheet(s)? Links to them are removed too.')) return;
        edit(function(){ s.nodes.slice().forEach(removeNode); D().sections.splice(si, 1); return null; });
      }));
    var title = text(sc.title, function(v){ edit(function(){ SC().title = clean(v); return secKey(di, si); }, { keep: true }); });
    title.id = 'mfName';
    f.appendChild(field('Title', title));
    f.appendChild(field('Note', area(sc.note, function(v){ edit(function(){ SC().note = v.trim(); return secKey(di, si); }, { keep: true }); }, 3)));
    f.appendChild(row(btn('+ Sheet', function(){ addSheet(di, si); })));
    return [f];
  }

  /* ---------- department ---------- */
  function deptForms(di){
    function D(){ return S.model.depts[di]; }
    var dp = D(), f = el('div', 'mbox'), dkey = 'edept:' + di;
    f.appendChild(head('Department',
      { fn: function(){ shift(S.model.depts, di, -1, function(j){ return 'edept:' + j; }); }, off: di === 0 },
      { fn: function(){ shift(S.model.depts, di, 1, function(j){ return 'edept:' + j; }); }, off: di === S.model.depts.length - 1 },
      function(){
        var d = D(), n = App.deptNodes(d).length;
        if (n && !confirm('Delete ' + d.name + ' and its ' + n + ' sheet(s)? Links to them are removed too.')) return;
        edit(function(){ App.deptNodes(d).forEach(removeNode); S.model.depts.splice(di, 1); return null; });
      }));
    var name = text(dp.name, function(v){
      if (!clean(v)) return;
      edit(function(){
        var d = D(), moved = false;
        S.tdata.tickets.forEach(function(t){ if (t.target === 'dept:' + d.name) { t.target = 'dept:' + clean(v); moved = true; } });
        d.name = clean(v);
        d.sections.forEach(function(sc){ sc.nodes.forEach(function(n){ n.dept = d.name; }); });
        if (moved) retargeted();
        return dkey;
      }, { keep: true });
    });
    name.id = 'mfName';
    f.appendChild(field('Name', name));
    f.appendChild(field('Lines under the name (for example Lead: Ana)', area(dp.text.join('\n'), function(v){
      edit(function(){ D().text = v.split('\n').map(function(l){ return l.trim(); }).filter(Boolean); return dkey; }, { keep: true });
    }, 3)));
    f.appendChild(row(
      btn('+ Section', function(){ addSection(di); }),
      btn('+ Sheet', function(){ addSheet(di, -1); })));
    return [f];
  }

  /* ---------- adding ---------- */
  /* si < 0: the last section of the department, or a new plain one if it has none */
  function addSheet(di, si){
    edit(function(){
      var dp = S.model.depts[di], sec = si >= 0 ? dp.sections[si] : dp.sections[dp.sections.length - 1];
      if (!sec) { sec = { title: null, note: '', nodes: [] }; dp.sections.push(sec); }
      var n = newNode('sheet', unique('New sheet'), dp.name);
      sec.nodes.push(n); wantFocus = true;
      return n.key;
    });
  }
  function addSection(di){
    edit(function(){
      var dp = S.model.depts[di];
      dp.sections.push({ title: 'New section', note: '', nodes: [] }); wantFocus = true;
      return secKey(di, dp.sections.length - 1);
    });
  }
  function addDept(){
    edit(function(){ S.model.depts.push({ name: 'New department', sections: [], text: [] }); wantFocus = true; return 'edept:' + (S.model.depts.length - 1); });
  }
  function addApp(){
    edit(function(){ var n = newNode('app', unique('New app'), null); S.model.apps.push(n); wantFocus = true; return n.key; });
  }
  App.formAdd = { sheet: addSheet, section: addSection, dept: addDept, app: addApp };

  /* ---------- links of the selected card ---------- */
  function linkRow(idx, sel){
    var l = S.model.links[idx], out = l.from.toLowerCase() === sel.key, other = out ? l.to : l.from;
    var r = el('div', 'mlink'), ok = !!S.nodeEls[other.toLowerCase()];
    var who = el(ok ? 'button' : 'span', 'who', other);
    if (ok) { who.type = 'button'; who.addEventListener('click', function(){ App.select(other.toLowerCase()); try { S.nodeEls[other.toLowerCase()].scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} }); }
    else who.textContent = other + ' (not on the map)';
    r.appendChild(row(el('span', 'dir', out ? 'Sends to' : 'Receives from'), who,
      btn('×', function(){ edit(function(){ S.model.links.splice(idx, 1); return S.selected; }); }, 'sm danger', 'Remove link')));
    var how = text(l.label, function(v){ edit(function(){ S.model.links[idx].label = v; return S.selected; }, { keep: true }); });
    how.setAttribute('list', 'mfHows'); how.placeholder = 'How (IMPORTRANGE, manual copy, ...)'; how.setAttribute('aria-label', 'How it is linked');
    r.appendChild(how);
    return r;
  }
  function addLinkRow(sel){
    var names = sheetNames().filter(function(x){ return x.toLowerCase() !== sel.key; });
    var box = el('div', 'maddlink');
    var dl = el('datalist'); dl.id = 'mfNames';
    names.forEach(function(x){ var o = el('option'); o.value = x; dl.appendChild(o); });
    box.appendChild(dl);
    var seg = el('div', 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Direction');
    [['to', 'Sends to'], ['from', 'Receives from']].forEach(function(d){
      var b = el('button', null, d[1]); b.type = 'button'; b.setAttribute('aria-pressed', String(addDir === d[0]));
      b.addEventListener('click', function(){ addDir = d[0]; Array.prototype.forEach.call(seg.children, function(c){ c.setAttribute('aria-pressed', String(c === b)); }); });
      seg.appendChild(b);
    });
    box.appendChild(seg);
    var target = el('input'); target.type = 'text'; target.setAttribute('list', 'mfNames'); target.placeholder = 'Search a sheet or app…'; target.setAttribute('aria-label', 'Sheet or app to link');
    var chips = el('div', 'chips');
    HOWS.forEach(function(h){
      var c = el('button', 'chip', h); c.type = 'button'; c.setAttribute('aria-pressed', String(addHow === h));
      c.addEventListener('click', function(){ addHow = addHow === h ? '' : h; Array.prototype.forEach.call(chips.children, function(x){ x.setAttribute('aria-pressed', String(x === c && addHow === h)); }); });
      chips.appendChild(c);
    });
    function add(){
      var want = target.value.trim().toLowerCase(), name = names.filter(function(x){ return x.toLowerCase() === want; })[0];
      if (!name) { say(want ? 'Pick a sheet or app from the list.' : 'Type or pick the sheet or app to link.'); target.focus(); return; }
      var from = addDir === 'to' ? sel.name : name, to = addDir === 'to' ? name : sel.name;
      if (S.model.links.some(function(l){ return l.from.toLowerCase() === from.toLowerCase() && l.to.toLowerCase() === to.toLowerCase(); })) { say('Those two are already linked that way.'); return; }
      var how = addHow;
      edit(function(){ S.model.links.push({ from: from, to: to, label: how }); return S.selected; });
      addHow = '';
    }
    target.addEventListener('keydown', function(ev){ if (ev.key === 'Enter') { ev.preventDefault(); add(); } });
    box.appendChild(row(target, btn('Add link', add, 'primary')));
    box.appendChild(chips);
    return box;
  }
  function linksBox(){
    var f = el('div', 'mbox mlinks'), sel = S.selected && S.nodeEls[S.selected] ? S.items[S.selected] : null;
    if (!sel) return f;
    f.appendChild(el('h3', null, 'Connected to'));
    var dl = el('datalist'); dl.id = 'mfHows';
    HOWS.forEach(function(h){ var o = el('option'); o.value = h; dl.appendChild(o); });
    f.appendChild(dl);
    var n = 0;
    S.model.links.forEach(function(l, idx){
      if (l.from.toLowerCase() !== sel.key && l.to.toLowerCase() !== sel.key) return;
      f.appendChild(linkRow(idx, sel)); n++;
    });
    if (!n) f.appendChild(el('p', 'hint', 'No links yet.'));
    if (sheetNames().length > 1) f.appendChild(addLinkRow(sel));
    return f;
  }
  function refreshLinks(){
    var old = root.querySelector('.mlinks');
    if (old) old.replaceWith(linksBox());
  }

  /* links that point at something no longer on the map: they belong to no card, so they are cleaned up here */
  function brokenLinks(){
    var f = el('div', 'mbox'), n = 0;
    S.model.links.forEach(function(l, idx){
      if (S.nodeEls[l.from.toLowerCase()] && S.nodeEls[l.to.toLowerCase()]) return;
      if (!n) f.appendChild(el('h3', null, 'Links to fix'));
      n++;
      f.appendChild(row(el('span', 'dir', l.from + ' → ' + l.to),
        btn('×', function(){ edit(function(){ S.model.links.splice(idx, 1); return null; }); }, 'sm danger', 'Remove link')));
    });
    return n ? f : null;
  }

  /* ---------- the panel ---------- */
  function fill(){
    filledKey = S.selected; forceFill = false;
    root.innerHTML = '';
    if (!active() || !S.model) return;
    var bar = el('div', 'mundo');
    uBtn = btn('Undo', doUndo, 'sm', 'Undo (Ctrl or Cmd + Z)'); rBtn = btn('Redo', doRedo, 'sm', 'Redo (Ctrl or Cmd + Shift + Z)');
    bar.appendChild(uBtn); bar.appendChild(rBtn);
    root.appendChild(bar); syncHist();
    var it = S.selected && S.items[S.selected], parts;
    if (!it) {
      var g = el('div', 'mbox');
      g.appendChild(el('p', 'hint', 'Click a card, a section or a department name on the map to edit it, or use the + buttons on the map to add things.'));
      g.appendChild(row(btn('+ Department', addDept), btn('+ App', addApp)));
      root.appendChild(g);
      var bl = brokenLinks(); if (bl) root.appendChild(bl);
    } else {
      parts = it.kind === 'section' ? sectionForms.apply(null, S.selected.split(':').slice(1).map(Number))
        : it.kind === 'dept' ? deptForms(+S.selected.split(':')[1])
        : nodeForms(S.selected);
      parts.forEach(function(p){ root.appendChild(p); });
    }
    if (wantFocus) { var i = $('mfName'); if (i) { i.focus(); i.select(); } wantFocus = false; }
  }

  function setMode(form){
    root.hidden = !form; ed.hidden = form; $('syntax').hidden = form;
    $('mfBtn').setAttribute('aria-pressed', String(form)); $('mtBtn').setAttribute('aria-pressed', String(!form));
    sync(); fill(); App.showDetail();
  }
  /* the + buttons on the map show only while the form is on screen */
  function sync(){ $('page').classList.toggle('formOn', active()); }
  /* text typed in the Markdown box is not in the undo steps */
  ed.addEventListener('input', function(){ undo = []; redo = []; syncHist(); });

  $('mfBtn').addEventListener('click', function(){ setMode(true); });
  $('mtBtn').addEventListener('click', function(){ setMode(false); });
  $('editBtn').addEventListener('click', function(){ sync(); fill(); App.showDetail(); });

  App.formActive = active;
  /* the map redraws its wires later and reports the same selection again: that must not rebuild the form under the cursor */
  App.onSelect = function(){ if (!skipFill && (forceFill || S.selected !== filledKey)) fill(); };
  fill();
})(App);
