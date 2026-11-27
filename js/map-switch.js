/* Header map switcher and "+ New map": lists maps/*.md through server.py and creates a new file from a small template.
 * Without the local server (file://) the controls stay hidden. */
(function(App){
  var S = App.S, $ = App.$, el = App.el;
  var pick = $('mapPick'), btn = $('newMapBtn'), dlg = $('newMapDlg'), title = $('newMapTitle');

  function slug(t){ return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'map'; }
  function template(t){
    return '# ' + t.replace(/[\r\n]+/g, ' ').trim() + '\n\n## First department\nLead: your name\n> First section\n- Example sheet | owner | medium\n';
  }
  function go(name, hash){ location.href = location.pathname + '?map=' + encodeURIComponent(name) + (hash || ''); }

  function fillPick(names){
    if (names.indexOf(S.param) < 0) names.unshift(S.param);
    pick.innerHTML = '';
    names.forEach(function(n){ var o = el('option', null, n.replace(/\.md$/, '')); o.value = n; o.selected = n === S.param; pick.appendChild(o); });
    pick.hidden = names.length < 2; btn.hidden = false;
  }
  pick.addEventListener('change', function(){ go(pick.value); });

  function updateHint(){
    $('newMapFile').textContent = title.value.trim() ? 'Saved as maps/' + slug(title.value) + '.md' : '';
    $('newMapErr').textContent = '';
  }
  btn.addEventListener('click', function(){ title.value = ''; updateHint(); dlg.showModal(); title.focus(); });
  title.addEventListener('input', updateHint);
  $('newMapCancel').addEventListener('click', function(){ dlg.close(); });
  $('newMapForm').addEventListener('submit', function(ev){
    ev.preventDefault();
    var t = title.value.trim(), name = slug(t) + '.md';
    if (!t) return;
    $('newMapOk').disabled = true;
    fetch('maps/' + name, { method: 'PUT', headers: { 'X-Map-Save': '1', 'X-Map-Create': '1', 'Content-Type': 'text/markdown' }, body: template(t) })
      .then(function(r){
        if (r.status === 409) throw new Error('There is already a map called ' + name + '. Pick another title.');
        if (!r.ok) throw new Error('Could not create the file (' + r.status + ').');
        go(name, '#edit');
      })
      .catch(function(e){ $('newMapErr').textContent = e.message; })
      .then(function(){ $('newMapOk').disabled = false; });
  });

  fetch('api/maps', { cache: 'no-store' })
    .then(function(r){ if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(names){ if (Array.isArray(names)) fillPick(names.filter(function(n){ return /^[\w.-]+\.md$/.test(n); })); })
    .catch(function(){});
})(App);
