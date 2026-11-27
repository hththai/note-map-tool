/* Tab switching and startup. Loaded last. */
(function(App){
  var S = App.S, $ = App.$;

  function showTab(name){
    var t = name === 'tickets', f = name === 'flows';
    $('mapView').hidden = t || f; $('board').hidden = !t; $('flowsView').hidden = !f; $('editBtn').hidden = t || f;
    $('tabMap').setAttribute('aria-selected', String(!t && !f)); $('tabTix').setAttribute('aria-selected', String(t)); $('tabFlows').setAttribute('aria-selected', String(f));
    if (t || f) App.select(null);
    if (!t) App.closeForm();
    if (!t && !f) setTimeout(App.drawWires, 50);
    if (f) App.renderFlows();
    if (S.model) $('stats').textContent = t ? App.ticketStats() : f ? App.flowStats() : S.mapStatsText;
    try { history.replaceState(null, '', t ? '#tickets' : f ? '#flows' : location.pathname + location.search); } catch (e) {}
  }
  App.showTab = showTab;
  $('tabMap').addEventListener('click', function(){ showTab('map'); });
  $('tabTix').addEventListener('click', function(){ showTab('tickets'); });
  $('tabFlows').addEventListener('click', function(){ showTab('flows'); });

  App.loadMap();
  App.render(S.savedMd);
  App.renderBoard();
  App.loadTickets();
  App.loadFlows();
  if (location.hash === '#tickets') showTab('tickets');
  if (location.hash === '#flows') showTab('flows');
  if (location.hash === '#edit') $('editBtn').click();
})(App);
