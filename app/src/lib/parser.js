/* ES module copy of js/parser.js. Mechanical conversion only: no logic changes.
 * scripts/verify-records.mjs checks it gives byte-identical results to the original on every file in maps/. */
/* Markdown -> map model. Pure: reads text, touches no DOM and no shared state. */

  function parseNode(body, kind){
    var parts = body.split('|').map(function(s){ return s.trim(); }).filter(function(s){ return s.length; });
    var name = parts.shift() || '(unnamed)', url = null, crit = null, det = [];
    parts.forEach(function(p){
      if (/^https?:\/\//i.test(p)) url = p;
      else if (/^(critical|high|medium|med|low)$/i.test(p)) { var c = p.toLowerCase(); crit = (c === 'critical') ? 'high' : (c === 'med' ? 'medium' : c); }
      else det.push(p);
    });
    return { name: name, key: name.toLowerCase(), kind: kind, url: url, crit: crit, details: det.join(' · '), parts: det, note: '' };
  }
  function parse(md){
    var out = { title: 'Sheets map', depts: [], apps: [], links: [], warn: [] };
    var cur = null, sec = null, mode = null, last = null;
    function curSec(){
      if (!sec) { sec = { title: null, note: '', nodes: [] }; cur.sections.push(sec); }
      return sec;
    }
    md.split(/\r?\n/).forEach(function(raw){
      var line = raw.trim(), m;
      if (!line || /^<!--/.test(line)) return;
      if (/^[ \t]+/.test(raw) && last && mode !== 'links') {
        last.note = last.note ? last.note + '\n' + line : line;
        return;
      }
      last = null;
      if (/^##\s+/.test(line)) {
        var name = line.replace(/^##\s+/, '').trim(), low = name.toLowerCase();
        sec = null;
        if (low === 'links') { mode = 'links'; cur = null; }
        else if (low === 'apps' || low === 'connected apps') { mode = 'apps'; cur = null; }
        else { mode = 'dept'; cur = { name: name, sections: [], text: [] }; out.depts.push(cur); }
        return;
      }
      if (/^#\s+/.test(line)) { out.title = line.replace(/^#\s+/, ''); return; }
      if (/^[-*]\s+/.test(line)) {
        var body = line.replace(/^[-*]\s+/, '');
        if (mode === 'links') {
          m = body.match(/^(.+?)\s*(?:->|→)\s*(.+?)(?:\s*\|\s*(.*))?$/);
          if (m) out.links.push({ from: m[1].trim(), to: m[2].trim(), label: (m[3] || '').trim() });
          else out.warn.push('Cannot read link: ' + body);
        } else if (mode === 'apps') { last = parseNode(body, 'app'); out.apps.push(last); }
        else if (mode === 'dept') { last = parseNode(body, 'sheet'); last.dept = cur.name; curSec().nodes.push(last); }
        else out.warn.push('Item outside a section: ' + body);
        return;
      }
      if (line.charAt(0) === '>') {
        if (cur) { sec = { title: line.replace(/^>\s*/, ''), note: '', nodes: [] }; cur.sections.push(sec); last = sec; }
        return;
      }
      if (cur) cur.text.push(line);
    });
    return out;
  }
  function deptNodes(d){ var r = []; d.sections.forEach(function(s){ r = r.concat(s.nodes); }); return r; }

export { parse, deptNodes };
