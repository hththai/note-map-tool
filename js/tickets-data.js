/* Tickets data: constants, lookups, IDs, totals, and loading/saving maps/<map>.tickets.json. No view code. */
(function(App){
  var S = App.S, $ = App.$;

  var STATUSES = [['todo', 'To do'], ['doing', 'In progress'], ['blocked', 'Blocked'], ['done', 'Done']];
  /* kinds of item and the letter their ID starts with; a change request or feature can belong to a project */
  var KINDS = [['ticket', 'T'], ['project', 'P'], ['change', 'C'], ['feature', 'F']];
  var DECISIONS = [['proposed', 'Proposed'], ['approved', 'Approved'], ['rejected', 'Rejected']];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* most important first; a ticket with no priority set counts as normal, and normal is not saved to the file */
  var PRIORITIES = [['urgent', 'Urgent'], ['high', 'High'], ['normal', 'Normal'], ['low', 'Low']];
  function priorityOf(t){ return PRIORITIES.some(function(p){ return p[0] === t.priority; }) ? t.priority : 'normal'; }
  function priorityRank(t){ for (var i = 0; i < PRIORITIES.length; i++) if (PRIORITIES[i][0] === priorityOf(t)) return i; return 2; }
  function priorityLabel(t){ return PRIORITIES[priorityRank(t)][1]; }
  /* small coloured badge; nothing for normal so the common case stays quiet */
  function priorityBadge(t){
    var p = priorityOf(t);
    if (p === 'normal') return null;
    var b = document.createElement('span'); b.className = 'pri ' + p; b.textContent = priorityLabel(t); b.title = 'Priority: ' + priorityLabel(t);
    return b;
  }
  function byPriority(list){
    return list.map(function(t, i){ return [t, i]; }).sort(function(a, b){ return priorityRank(a[0]) - priorityRank(b[0]) || a[1] - b[1]; }).map(function(x){ return x[0]; });
  }

  function isKind(k){ return KINDS.some(function(x){ return x[0] === k; }); }
  function prefixOf(k){ for (var i = 0; i < KINDS.length; i++) if (KINDS[i][0] === k) return KINDS[i][1]; return 'T'; }
  function decisionLabel(d){ for (var i = 0; i < DECISIONS.length; i++) if (DECISIONS[i][0] === d) return DECISIONS[i][1]; return d; }
  function statusLabel(s){ for (var i = 0; i < STATUSES.length; i++) if (STATUSES[i][0] === s) return STATUSES[i][1]; return s; }
  function findTicket(id){ for (var i = 0; i < S.tdata.tickets.length; i++) if (S.tdata.tickets[i].id === id) return S.tdata.tickets[i]; return null; }
  function itemsOf(p){ return S.tdata.tickets.filter(function(x){ return x.project === p.id; }); }
  function projectOf(t){ var p = t.project && findTicket(t.project); return p && p.type === 'project' ? p : null; }
  function openFor(target){ return S.tdata.tickets.filter(function(t){ return t.target === target && t.status !== 'done'; }); }
  function ticketsFile(){ return S.param.replace(/\.md$/, '') + '.tickets.json'; }
  function setTStatus(t){ $('tstatus').textContent = t || ''; }

  /* name of the map item a ticket points to: '' = not linked, null = no longer on the map */
  function targetName(t){
    if (!t) return '';
    if (t.indexOf('dept:') === 0) {
      var dn = t.slice(5);
      return S.model.depts.some(function(d){ return d.name === dn; }) ? dn : null;
    }
    return S.items[t] && S.items[t].kind !== 'section' ? S.items[t].name : null;
  }

  function today(){ return new Date().toISOString().slice(0, 10); }
  /* IDs look like T20261116.001 (ticket) or P20261116.001 (project): prefix, local date, then a per-day counter */
  function newId(type){
    var d = new Date(), pad = function(n){ return (n < 10 ? '0' : '') + n; };
    var base = prefixOf(type) + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.', n = 0;
    S.tdata.tickets.forEach(function(t){
      if (String(t.id).indexOf(base) === 0) n = Math.max(n, parseInt(String(t.id).slice(base.length), 10) || 0);
    });
    return base + ('00' + (n + 1)).slice(-3);
  }

  function hoursOf(t){ return (t.log || []).reduce(function(a, e){ return a + (+e.hours || 0); }, 0); }
  function fmtH(h){ return (Math.round(h * 100) / 100) + ' h'; }
  /* a project's totals: its own items (not counting rejected change requests), done count, and hours logged on it and on them */
  function projectStats(p){
    var its = itemsOf(p).filter(function(x){ return x.decision !== 'rejected'; });
    var done = its.filter(function(x){ return x.status === 'done'; }).length;
    var hrs = its.reduce(function(a, x){ return a + hoursOf(x); }, hoursOf(p));
    return { total: its.length, done: done, hours: hrs };
  }
  function statsLine(s){
    var parts = [];
    if (s.total) parts.push(s.done + ' of ' + s.total + ' items done');
    if (s.hours) parts.push('⏱ ' + fmtH(s.hours));
    return parts.join(' · ');
  }
  function prettyDate(iso){ var d = new Date(iso + 'T00:00:00'); return isNaN(d) ? '' : d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function initials(n){
    var w = String(n || '').trim().split(/\s+/);
    return (w.length > 1 ? w[0].charAt(0) + w[1].charAt(0) : w[0].slice(0, 2)).toUpperCase();
  }
  function ticketStats(){
    var all = S.tdata.tickets, open = all.filter(function(t){ return t.status !== 'done'; }).length;
    var blocked = all.filter(function(t){ return t.status === 'blocked'; }).length;
    return all.length ? all.length + ' tickets · ' + open + ' open' + (blocked ? ' · ' + blocked + ' blocked' : '') : 'No tickets yet';
  }

  function saveTickets(){
    setTStatus('Saving…'); S.detailWarn = '';
    fetch('maps/' + ticketsFile(), { method: 'PUT', headers: { 'X-Map-Save': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(S.tdata, null, 2) + '\n' })
      .then(function(r){ if (!r.ok) throw new Error(r.status); setTStatus('Saved to maps/' + ticketsFile() + '.'); })
      .catch(function(){
        var msg = 'Could not save here. Start the page with start.command (it runs server.py). Changes last only until you reload.';
        setTStatus(msg);
        if (!$('detail').hidden) { S.detailWarn = msg; App.showDetail(); }
      });
  }
  /* call after any ticket edit: redraw board and map badges, then save */
  function changed(){ App.renderBoard(); App.render($('ed').value); saveTickets(); }
  function loadTickets(){
    fetch('maps/' + ticketsFile(), { cache: 'no-store' })
      .then(function(r){ if (r.status === 404) return null; if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(d){
        if (d && Array.isArray(d.tickets)) {
          var max = 0;
          d.tickets.forEach(function(t){
            if (!STATUSES.some(function(s){ return s[0] === t.status; })) t.status = 'todo';
            if (!isKind(t.type)) t.type = 'ticket';
            var legacy = /^T-(\d+)$/.exec(String(t.id));
            if (legacy) max = Math.max(max, parseInt(legacy[1], 10));
          });
          S.tdata = { nextId: Math.max(Number(d.nextId) || 1, max + 1), tickets: d.tickets };
        }
        App.renderBoard(); App.render($('ed').value);
      })
      .catch(function(){ setTStatus('Could not read maps/' + ticketsFile() + '. Open the page through the local server (see README).'); App.renderBoard(); });
  }

  App.STATUSES = STATUSES; App.PRIORITIES = PRIORITIES;
  App.priorityOf = priorityOf; App.priorityLabel = priorityLabel; App.priorityBadge = priorityBadge; App.byPriority = byPriority;
  App.statusLabel = statusLabel; App.decisionLabel = decisionLabel;
  App.findTicket = findTicket; App.itemsOf = itemsOf; App.projectOf = projectOf; App.openFor = openFor;
  App.targetName = targetName; App.today = today; App.newId = newId;
  App.hoursOf = hoursOf; App.fmtH = fmtH; App.projectStats = projectStats; App.statsLine = statsLine;
  App.prettyDate = prettyDate; App.initials = initials; App.ticketStats = ticketStats;
  App.saveTickets = saveTickets;
  App.changed = changed; App.loadTickets = loadTickets;
})(App);
