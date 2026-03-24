(function () {
  var root = document.documentElement;
  var rawMode = String((root && root.dataset && root.dataset.mode) || 'TEACHER').toUpperCase();
  var rawSection = String((root && root.dataset && root.dataset.section) || 'all').toLowerCase();
  var mode = rawMode === 'STUDENT' ? 'STUDENT' : 'TEACHER';
  var allowedSections = { all: true, calendar: true, bookings: true, completed: true, manage: true };
  var section = allowedSections[rawSection] ? rawSection : 'all';
  var params = new URLSearchParams(window.location.search || '');
  params.set('mode', mode);
  params.set('section', section);
  var query = params.toString();
  var target = '/app.html' + (query ? '?' + query : '') + String(window.location.hash || '');
  if (window.location.pathname !== '/app.html') {
    window.location.replace(target);
  }
})();
