/* Theme toggle, shared by every page. The initial value is set by an inline
   script in <head> so there is no flash of the wrong theme. */
(function () {
  var root = document.documentElement;
  var btn = document.getElementById('themer');
  if (!btn) return;

  function label() {
    var dark = root.getAttribute('data-theme') === 'dark';
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    btn.setAttribute('title', dark ? 'Light theme' : 'Dark theme');
  }

  btn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('ol-theme', next); } catch (e) {}
    label();
    document.dispatchEvent(new CustomEvent('ol:theme', { detail: next }));
  });

  label();
})();
