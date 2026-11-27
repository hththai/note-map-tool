/* Map model -> Markdown, the reverse of parser.js. Pure: reads a model, touches no DOM and no shared state.
 * Comments and blank lines are not kept; lossy() tells the editor when a file has more than the model holds. */
(function(App){
  function clean(v){ return String(v == null ? '' : v).replace(/[|\r\n]/g, ' ').trim(); }

  function noteLines(note, out){
    if (note) note.split('\n').forEach(function(l){ if (l.trim()) out.push('  ' + l.trim()); });
  }
  function nodeLine(n, out){
    var parts = [clean(n.name) || '(unnamed)'];
    (n.parts || []).forEach(function(p){ if (clean(p)) parts.push(clean(p)); });
    if (n.crit) parts.push(n.crit);
    if (n.url) parts.push(clean(n.url));
    out.push('- ' + parts.join(' | '));
    noteLines(n.note, out);
  }

  function stringify(m){
    var out = ['# ' + clean(m.title), ''];
    m.depts.forEach(function(d){
      out.push('## ' + clean(d.name));
      d.text.forEach(function(t){ if (t.trim()) out.push(t.trim()); });
      d.sections.forEach(function(s){
        if (s.title != null) { out.push(('> ' + clean(s.title)).trim()); noteLines(s.note, out); }
        s.nodes.forEach(function(n){ nodeLine(n, out); });
      });
      out.push('');
    });
    if (m.apps.length) {
      out.push('## Apps');
      m.apps.forEach(function(n){ nodeLine(n, out); });
      out.push('');
    }
    if (m.links.length) {
      out.push('## Links');
      m.links.forEach(function(l){ out.push('- ' + clean(l.from) + ' -> ' + clean(l.to) + (l.label && l.label.trim() ? ' | ' + l.label.replace(/[\r\n]/g, ' ').trim() : '')); });
      out.push('');
    }
    return out.join('\n').replace(/\n+$/, '') + '\n';
  }

  function plain(m){ return JSON.stringify(m, function(k, v){ return k === 'el' ? undefined : v; }); }
  /* true if writing the map back out would drop something md holds (a comment, a line the parser could not read) */
  function lossy(md){
    var m = App.parse(md);
    return m.warn.length > 0 || /<!--/.test(md) || plain(m) !== plain(App.parse(stringify(m)));
  }

  App.stringify = stringify;
  App.mapLossy = lossy;
})(App);
