/* The Map tab: draw departments, sheets and apps from the parsed model, the wires between them,
 * card selection, and the detail panel for the selected card. */
(function(App){
  var S = App.S, $ = App.$, el = App.el;

  function infoDot(){ var i = el('span', 'info', 'i'); i.setAttribute('aria-label', 'has a note'); return i; }
  function makeNode(n, deptName){
    var d = el('div', 'node' + (n.kind === 'app' ? ' app' : ''));
    d.tabIndex = 0;
    d.setAttribute('role', 'button');
    var nm = el('div', 'nm'), left = el('span', 'l');
    if (n.url && /^https?:\/\//i.test(n.url)) {
      var a = el('a', null, n.name); a.href = n.url; a.target = '_blank'; a.rel = 'noopener';
      a.addEventListener('click', function(ev){ ev.stopPropagation(); });
      left.appendChild(a);
    } else left.appendChild(document.createTextNode(n.name));
    if (n.note) left.appendChild(infoDot());
    var open = App.openFor(n.key).length;
    if (open) left.appendChild(App.tixBadge(open));
    nm.appendChild(left);
    if (n.crit) nm.appendChild(el('span', 'pill ' + n.crit, n.crit));
    d.appendChild(nm);
    if (n.details) d.appendChild(el('div', 'dt', n.details));
    d.dataset.key = n.key;
    d._dept = deptName || '__apps';
    return d;
  }

  /* "+" buttons shown while the form editor is open (CSS hides them otherwise); map-form.js supplies App.formAdd */
  function addBtn(label, fn){
    var b = el('button', 'addHere', label); b.type = 'button';
    b.addEventListener('click', function(ev){ ev.stopPropagation(); if (App.formAdd) fn(App.formAdd); });
    return b;
  }

  function render(md){
    var model = S.model = App.parse(md);
    var map = $('map');
    map.innerHTML = '';
    map.classList.remove('focus');
    S.nodeEls = {}; S.selected = null;
    var warn = model.warn.slice();
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.innerHTML = '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="arrowhead" d="M0 0L10 5L0 10z"/></marker></defs>';
    map.appendChild(svg);
    S.items = {};
    function reg(n, d){
      if (S.nodeEls[n.key]) warn.push('Duplicate name "' + n.name + '": links use the first one.');
      else { S.nodeEls[n.key] = d; S.items[n.key] = n; n.el = d; }
    }
    var cols = el('div', 'cols');
    model.depts.forEach(function(dp, di){
      var box = el('section', 'dept');
      var h2 = el('h2', null, dp.name), dOpen = App.openFor('dept:' + dp.name).length;
      if (dOpen) h2.appendChild(App.tixBadge(dOpen));
      h2.tabIndex = 0;
      S.items['edept:' + di] = { kind: 'dept', name: dp.name, note: '', ref: dp, el: h2 };
      box.appendChild(h2);
      dp.text.forEach(function(t){ box.appendChild(el('p', 'meta', t)); });
      dp.sections.forEach(function(sc, si){
        var wrap = el('div', 'sec');
        if (sc.title) {
          var key = 'sec:' + di + ':' + si;
          var h = el('div', 'noteCard hasNote');
          h.appendChild(document.createTextNode(sc.title));
          if (sc.note) h.appendChild(infoDot());
          h.tabIndex = 0; h.setAttribute('role', 'button');
          S.items[key] = { kind: 'section', name: sc.title, note: sc.note, dept: dp.name, ref: sc, el: h };
          wrap.appendChild(h);
        }
        sc.nodes.forEach(function(n){ var d = makeNode(n, dp.name); reg(n, d); wrap.appendChild(d); });
        wrap.appendChild(addBtn('+ Sheet', function(f){ f.sheet(di, si); }));
        box.appendChild(wrap);
      });
      var tail = el('div', 'addRow');
      if (!dp.sections.length) tail.appendChild(addBtn('+ Sheet', function(f){ f.sheet(di, -1); }));
      tail.appendChild(addBtn('+ Section', function(f){ f.section(di); }));
      box.appendChild(tail);
      cols.appendChild(box);
    });
    map.appendChild(cols);
    var foot = el('div', 'addRow addFoot');
    foot.appendChild(addBtn('+ Department', function(f){ f.dept(); }));
    foot.appendChild(addBtn('+ App', function(f){ f.app(); }));
    map.appendChild(foot);
    if (model.apps.length) {
      var ab = el('section', 'appsBox');
      ab.appendChild(el('h2', null, 'Connected apps'));
      var row = el('div', 'row');
      model.apps.forEach(function(n){ var d = makeNode(n, null); reg(n, d); row.appendChild(d); });
      ab.appendChild(row); map.appendChild(ab);
    }
    Object.keys(S.items).forEach(function(k){
      var d = S.items[k].el, dept = S.items[k].kind === 'dept';
      d.addEventListener('click', function(ev){ if (dept && !formOn()) return; ev.stopPropagation(); select(S.selected === k ? null : k); });
      d.addEventListener('keydown', function(ev){ if (dept && !formOn()) return; if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(S.selected === k ? null : k); } });
    });
    map.onclick = function(){ select(null); };

    var ul = $('links'); ul.innerHTML = '';
    model.links.forEach(function(l){
      var a = S.nodeEls[l.from.toLowerCase()], b = S.nodeEls[l.to.toLowerCase()];
      if (!a) warn.push('Link starts at "' + l.from + '", which is not a sheet or app.');
      if (!b) warn.push('Link ends at "' + l.to + '", which is not a sheet or app.');
      var li = el('li', null, l.from + ' → ' + l.to);
      li.appendChild(el('span', 'how', (/manual/i.test(l.label) ? 'Manual · ' : 'Automatic · ') + (l.label || 'method not set')));
      ul.appendChild(li);
    });
    S.tdata.tickets.forEach(function(t){
      if (t.target && App.targetName(t.target) === null) warn.push('Ticket ' + t.id + ' is linked to "' + t.target + '", which is not on the map.');
    });
    var nSheets = model.depts.reduce(function(s, d){ return s + App.deptNodes(d).length; }, 0);
    var nOpen = S.tdata.tickets.filter(function(t){ return t.status !== 'done'; }).length;
    $('title').textContent = model.title;
    S.mapStatsText = model.depts.length + ' departments · ' + nSheets + ' sheets · ' + model.apps.length + ' apps · ' + model.links.length + ' links' + (S.tdata.tickets.length ? ' · ' + nOpen + ' open tickets' : '');
    $('stats').textContent = $('board').hidden ? S.mapStatsText : App.ticketStats();
    document.title = model.title;
    var w = $('warn'); w.innerHTML = '';
    warn.forEach(function(t){ w.appendChild(el('div', null, t)); });
    requestAnimationFrame(drawWires);
  }

  /* ---------- wires ---------- */
  function drawWires(){
    var map = $('map'), svg = map.querySelector('svg');
    if (!svg || !S.model) return;
    var mr = map.getBoundingClientRect();
    svg.setAttribute('width', mr.width); svg.setAttribute('height', mr.height);
    Array.prototype.slice.call(svg.querySelectorAll('path.wire')).forEach(function(p){ p.remove(); });
    function R(e){ var r = e.getBoundingClientRect(); return { l: r.left - mr.left, r: r.right - mr.left, t: r.top - mr.top, b: r.bottom - mr.top, cx: (r.left + r.right) / 2 - mr.left, cy: (r.top + r.bottom) / 2 - mr.top }; }
    var loops = {};
    S.model.links.forEach(function(l){
      var A = S.nodeEls[l.from.toLowerCase()], B = S.nodeEls[l.to.toLowerCase()];
      if (!A || !B || A === B) return;
      var a = R(A), b = R(B), d;
      if (A._dept === B._dept && A._dept !== '__apps') {
        var k = loops[A._dept] = (loops[A._dept] || 0) + 1, bl = 12 + k * 8;
        d = 'M' + a.r + ' ' + a.cy + ' C' + (a.r + bl) + ' ' + a.cy + ' ' + (b.r + bl) + ' ' + b.cy + ' ' + b.r + ' ' + b.cy;
      } else if (a.r + 6 <= b.l) {
        var dx = Math.max(30, (b.l - a.r) / 2);
        d = 'M' + a.r + ' ' + a.cy + ' C' + (a.r + dx) + ' ' + a.cy + ' ' + (b.l - dx) + ' ' + b.cy + ' ' + b.l + ' ' + b.cy;
      } else if (b.r + 6 <= a.l) {
        var dx2 = Math.max(30, (a.l - b.r) / 2);
        d = 'M' + a.l + ' ' + a.cy + ' C' + (a.l - dx2) + ' ' + a.cy + ' ' + (b.r + dx2) + ' ' + b.cy + ' ' + b.r + ' ' + b.cy;
      } else if (a.b <= b.t) {
        var dy = Math.max(30, (b.t - a.b) / 2);
        d = 'M' + a.cx + ' ' + a.b + ' C' + a.cx + ' ' + (a.b + dy) + ' ' + b.cx + ' ' + (b.t - dy) + ' ' + b.cx + ' ' + b.t;
      } else {
        var dy2 = Math.max(30, (a.t - b.b) / 2);
        d = 'M' + a.cx + ' ' + a.t + ' C' + a.cx + ' ' + (a.t - dy2) + ' ' + b.cx + ' ' + (b.b + dy2) + ' ' + b.cx + ' ' + b.b;
      }
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', 'wire' + (/manual/i.test(l.label) ? ' manual' : ''));
      p.setAttribute('marker-end', 'url(#arr)');
      p.dataset.from = l.from.toLowerCase(); p.dataset.to = l.to.toLowerCase();
      svg.appendChild(p);
    });
    applySelection();
  }

  /* ---------- selection and detail panel ---------- */
  function formOn(){ return !!(App.formActive && App.formActive()); }
  function select(k){ if (k !== S.selected) { S.detailNote = ''; S.detailWarn = ''; } S.selected = k; applySelection(); }
  function applySelection(){
    var map = $('map'), on = {}, isNode = !!(S.selected && S.nodeEls[S.selected]);
    Array.prototype.forEach.call(map.querySelectorAll('path.wire'), function(p){
      var hit = isNode && (p.dataset.from === S.selected || p.dataset.to === S.selected);
      p.classList.toggle('on', hit);
      if (hit) { on[p.dataset.from] = true; on[p.dataset.to] = true; }
    });
    if (isNode) on[S.selected] = true;
    Object.keys(S.nodeEls).forEach(function(k){ S.nodeEls[k].classList.toggle('on', !!on[k]); });
    Object.keys(S.items).forEach(function(k){ S.items[k].el.classList.toggle('sel', k === S.selected); });
    map.classList.toggle('focus', isNode);
    showDetail();
    if (App.onSelect) App.onSelect();
  }
  function showDetail(){
    var box = $('detail'), it = S.selected && S.items[S.selected];
    if (!it || formOn()) { box.hidden = true; box.innerHTML = ''; $('page').classList.remove('detailOpen'); return; }
    /* keep a half-typed quick-add title when the detail is redrawn for the same item */
    var prevQ = box.dataset.key === S.selected ? box.querySelector('.quick input') : null;
    var prevVal = prevQ ? prevQ.value : '', hadFocus = !!prevQ && document.activeElement === prevQ;
    box.dataset.key = S.selected;
    box.innerHTML = '';
    var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', function(){ select(null); });
    box.appendChild(x);
    var h = el('h4', null, it.name);
    if (it.crit) h.appendChild(el('span', 'pill ' + it.crit, it.crit));
    box.appendChild(h);
    var bits = [];
    if (it.kind === 'section') bits.push(it.dept + ' · section');
    else { bits.push(it.kind === 'app' ? 'Connected app' : (it.dept || '')); if (it.details) bits.push(it.details); }
    box.appendChild(el('p', 'meta2', bits.filter(Boolean).join(' · ')));
    if (S.detailNote) box.appendChild(el('p', 'meta2 ok', S.detailNote));
    if (S.detailWarn) box.appendChild(el('p', 'meta2 bad', S.detailWarn));
    if (it.url && /^https?:\/\//i.test(it.url)) {
      var lp = el('p', 'meta2'), a = el('a', null, 'Open sheet'); a.href = it.url; a.target = '_blank'; a.rel = 'noopener';
      lp.appendChild(a); box.appendChild(lp);
    }
    var body = el('p', 'body' + (it.note ? '' : ' empty'), it.note || 'No note yet. Add an indented line under this item in the Markdown.');
    box.appendChild(body);
    var linked = S.tdata.tickets.filter(function(t){ return t.target === S.selected; });
    if (linked.length) {
      /* Open tickets first, done last; only the first few show until "Show all". Resets on every selection. */
      var LIMIT = 3, isDone = function(t){ return t.status === 'done'; };
      linked = linked.filter(function(t){ return !isDone(t); }).concat(linked.filter(isDone));
      var tu = el('ul', 'conns'), toggle = null;
      var fillTickets = function(all){
        tu.textContent = '';
        var shown = all ? linked : linked.filter(function(t){ return !isDone(t); }).slice(0, LIMIT);
        shown.forEach(function(t){
          var li = el('li'), b = el('button', null, t.id + ' ' + t.title); b.type = 'button';
          b.addEventListener('click', function(){ App.showTab('tickets'); App.openForm(t.id); });
          li.appendChild(document.createTextNode(App.statusLabel(t.status) + ' · '));
          li.appendChild(b); tu.appendChild(li);
        });
        if (toggle) {
          var nDone = linked.filter(isDone).length;
          toggle.textContent = all ? 'Show fewer' : 'Show all ' + linked.length + (nDone ? ' (' + nDone + ' done)' : '');
        }
      };
      box.appendChild(el('p', 'meta2', 'Tickets and projects'));
      box.appendChild(tu);
      if (linked.length > LIMIT || linked.some(isDone)) {
        var expanded = false;
        toggle = el('button', 'tickets-toggle'); toggle.type = 'button';
        toggle.addEventListener('click', function(){ expanded = !expanded; fillTickets(expanded); });
        box.appendChild(toggle);
      }
      fillTickets(false);
    }
    if (S.nodeEls[S.selected]) {
      var qa = App.quickAdd(S.selected, it, prevVal);
      box.appendChild(qa);
      if (hadFocus) qa.querySelector('input').focus();
    }
    if (S.nodeEls[S.selected]) {
      var ul = el('ul', 'conns'), n = 0;
      S.model.links.forEach(function(l){
        var f = l.from.toLowerCase(), t = l.to.toLowerCase();
        if (f !== S.selected && t !== S.selected) return;
        var outgoing = f === S.selected, other = outgoing ? l.to : l.from, li = el('li');
        li.appendChild(document.createTextNode(outgoing ? 'Sends to ' : 'Receives from '));
        var b = el('button', null, other); b.type = 'button';
        b.addEventListener('click', function(){
          var ok = other.toLowerCase();
          if (S.nodeEls[ok]) { select(ok); try { S.nodeEls[ok].scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} }
        });
        li.appendChild(b);
        li.appendChild(document.createTextNode(' · ' + (l.label || 'method not set')));
        ul.appendChild(li); n++;
      });
      if (n) box.appendChild(ul);
    }
    box.hidden = false; $('page').classList.add('detailOpen');
  }

  document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape' && S.selected) select(null); });
  if (window.ResizeObserver) new ResizeObserver(function(){ drawWires(); }).observe($('map'));
  window.addEventListener('resize', drawWires);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawWires);

  App.render = render;
  App.drawWires = drawWires;
  App.select = select;
  App.showDetail = showDetail;
})(App);
