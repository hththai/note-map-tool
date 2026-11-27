/* ES module copy of js/flows-parser.js. Mechanical conversion only: no logic changes.
 * scripts/verify-records.mjs checks it gives byte-identical results to the original on every file in maps/. */
/* Markdown -> business flows. Pure: reads text, touches no DOM and no shared state.
 *
 *   # Flow name
 *   Every: Friday                 (free text, optional)
 *   Teams: Harvest, IT, Finance   (lane order, optional)
 *   1. Harvest | Check piece work | Fri
 *   2. IT | Top up | Fri | sheet: Payroll Summary | <- Harvest: Piece work ready
 *   3. Finance | Review OT | Mon | ticket: T20261116.001 | <- IT: Top up done | -> 1: Sent back to step 1
 *   4. IT | Combine | <- 1 | <- 3: Done      ("<- 1" waits on step 1 itself; use several to wait on several steps)
 *   5. IT | Start on its own | <- start      (no arrow in; without "<-" a step follows the step before it)
 *     Indented line = note for the step above.
 */

  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function dayOf(s){
    var m = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/i.exec(s);
    return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : null;
  }

  function parseStep(body, flow){
    var parts = body.split('|').map(function(s){ return s.trim(); }).filter(function(s){ return s.length; });
    var step = { team: parts.shift() || '(no team)', title: parts.shift() || '(untitled)', day: null, sheet: null, ticket: null, triggers: [], backs: [], note: '' };
    parts.forEach(function(p){
      var m;
      if ((m = /^(?:->|→)\s*(\d+)\s*(?::\s*(.*))?$/.exec(p))) step.backs.push({ num: +m[1], msg: (m[2] || '').trim(), ref: null });
      else if (/^(?:<-|←)\s*start$/i.test(p)) step.standalone = true;
      else if ((m = /^(?:<-|←)\s*#?(\d+)\s*(?::\s*(.*))?$/.exec(p))) step.triggers.push({ num: +m[1], msg: (m[2] || '').trim(), ref: null });
      else if ((m = /^(?:<-|←)\s*(.+?)\s*:\s*(.+)$/.exec(p))) step.triggers.push({ team: m[1], msg: m[2] });
      else if ((m = /^(?:<-|←)\s*(.+)$/.exec(p))) step.triggers.push({ team: m[1], msg: '' });
      else if ((m = /^sheet:\s*(.+)$/i.exec(p))) step.sheet = m[1];
      else if ((m = /^ticket:\s*(.+)$/i.exec(p))) step.ticket = m[1];
      else if (dayOf(p)) step.day = dayOf(p);
      else { flow.warn.push('Step "' + step.title + '": cannot read "' + p + '"'); flow.dropped.push('Step "' + step.title + '": ' + p); }
    });
    return step;
  }

  /* links each step to the latest earlier step of the team it waits on; a step with no "<-" follows the step before it */
  function link(flow){
    flow.edges = [];
    flow.steps.forEach(function(st, i){
      st.backs = st.backs.filter(function(b){
        b.ref = flow.steps[b.num - 1] || null;
        if (!b.ref || b.ref === st) { flow.warn.push('Step "' + st.title + '" sends back to step ' + b.num + ', which is not another step.'); flow.dropped.push('Step "' + st.title + '": -> ' + b.num); return false; }
        return true;
      });
      /* tIdx is the arrow's place in the step's triggers (-1 = the automatic arrow from the step before); "<- start" removes that one */
      if (!st.triggers.length) { if (i && !st.standalone) flow.edges.push({ from: i - 1, to: i, msg: '', tIdx: -1 }); return; }
      st.triggers.forEach(function(t, ti){
        if (t.num != null) {
          /* "<- 1" waits on that exact step, so a step can wait on several steps, even in the same team */
          t.ref = flow.steps[t.num - 1] || null;
          var k = flow.steps.indexOf(t.ref);
          if (k < 0 || k >= i) flow.warn.push('Step "' + st.title + '" waits on step ' + t.num + ', which is not an earlier step.');
          if (k < 0) flow.dropped.push('Step "' + st.title + '": <- ' + t.num);
          else flow.edges.push({ from: k, to: i, msg: t.msg, tIdx: ti });
          return;
        }
        if (t.ref) {
          var q = flow.steps.indexOf(t.ref);
          if (q >= 0 && q < i) flow.edges.push({ from: q, to: i, msg: t.msg, tIdx: ti });
          return;
        }
        for (var j = i - 1; j >= 0; j--) {
          if (flow.steps[j].team.toLowerCase() === t.team.toLowerCase()) { flow.edges.push({ from: j, to: i, msg: t.msg, tIdx: ti }); return; }
        }
        flow.warn.push('Step "' + st.title + '" waits on "' + t.team + '", which has no earlier step.');
      });
    });
  }

  function lanes(flow){
    var seen = {}, out = [], declared = flow.teams.length > 0;
    function add(name){ var k = name.toLowerCase(); if (!seen[k]) { seen[k] = true; out.push(name); } }
    flow.teams.forEach(add);
    flow.steps.forEach(function(st){
      if (declared && !seen[st.team.toLowerCase()]) flow.warn.push('Team "' + st.team + '" is not in the Teams line.');
      add(st.team);
    });
    flow.teams = out;
  }

  function parseFlows(md){
    var flows = [], cur = null, last = null;
    md.split(/\r?\n/).forEach(function(raw){
      var line = raw.trim(), m;
      if (!line || /^<!--/.test(line)) return;
      if (/^[ \t]+/.test(raw) && last) { last.note = last.note ? last.note + '\n' + line : line; return; }
      last = null;
      if ((m = /^#\s+(.+)$/.exec(line))) { cur = { title: m[1].trim(), every: '', teams: [], steps: [], edges: [], warn: [], dropped: [] }; flows.push(cur); return; }
      if (!cur) return;
      if ((m = /^every:\s*(.*)$/i.exec(line))) { cur.every = m[1]; return; }
      if ((m = /^teams:\s*(.*)$/i.exec(line))) {
        cur.teams = m[1].split(',').map(function(s){ return s.trim(); }).filter(function(s){ return s.length; });
        return;
      }
      if ((m = /^(?:\d+[.)]|[-*])\s+(.+)$/.exec(line))) { last = parseStep(m[1], cur); cur.steps.push(last); return; }
      cur.warn.push('Cannot read line: ' + line); cur.dropped.push(line);
    });
    flows.forEach(function(f){ lanes(f); link(f); });
    return flows;
  }

  /* the reverse of parseFlows, so the form editor can write the text file. Empty lanes are kept in the Teams line.
   Text the parser could not use (flow.dropped) is not in the model, so it is not written back. */
  function stringifyFlows(flows){
    return flows.map(function(f){
      var seen = {}, teams = [], out = ['# ' + f.title];
      f.teams.concat(f.steps.map(function(st){ return st.team; })).forEach(function(t){
        var k = t.toLowerCase();
        if (!seen[k]) { seen[k] = true; teams.push(t); }
      });
      (f.comments || []).forEach(function(c){ out.push('<!-- ' + c + ' -->'); });
      if (f.every) out.push('Every: ' + f.every);
      if (teams.length) out.push('Teams: ' + teams.join(', '));
      f.steps.forEach(function(st, i){
        var p = [st.team, st.title];
        if (st.day) p.push(st.day);
        if (st.sheet) p.push('sheet: ' + st.sheet);
        if (st.ticket) p.push('ticket: ' + st.ticket);
        st.triggers.forEach(function(t){
          if (t.ref || t.num != null) { var k = f.steps.indexOf(t.ref); if (k >= 0 && t.ref !== st) p.push('<- ' + (k + 1) + (t.msg ? ': ' + t.msg : '')); return; }
          p.push('<- ' + t.team + (t.msg ? ': ' + t.msg : ''));
        });
        if (st.standalone && !st.triggers.length) p.push('<- start');
        st.backs.forEach(function(b){ var k = f.steps.indexOf(b.ref); if (k >= 0 && b.ref !== st) p.push('-> ' + (k + 1) + (b.msg ? ': ' + b.msg : '')); });
        out.push((i + 1) + '. ' + p.join(' | '));
        if (st.note) st.note.split('\n').forEach(function(l){ out.push('  ' + l); });
      });
      return out.join('\n');
    }).join('\n\n') + '\n';
  }

export { parseFlows, stringifyFlows, DAYS as FLOW_DAYS };
