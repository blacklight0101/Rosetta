// Rosetta card filters (RF-503). A classic script loaded deferred by report.html: without it the
// cards table lists every card and the filter controls stay hidden. With it the reader can show the
// cards of one type, one area and one claim status, with no server. It reads nothing but the
// attributes the page was written with and the address fragment, and a value from the fragment is
// used only when it is the value of an option the page offers; it changes nothing but the `hidden`
// attribute, the selected options, the status text and the fragment: no markup is built from text
// (RF-507).
(function () {
  'use strict';

  const doc = globalThis.document;
  const panel = doc.querySelector('[data-card-filters]');
  const table = doc.querySelector('table.cards');
  const status = doc.querySelector('[data-filter-status]');
  const empty = doc.querySelector('[data-filter-empty]');
  if (panel === null || table === null || status === null || empty === null) return;

  const selects = Array.from(panel.querySelectorAll('select[data-filter]'));
  const reset = panel.querySelector('[data-filter-reset]');
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  const wrap = table.parentElement;
  // A fragment longer than this is not a filter that Rosetta wrote.
  const maxFragment = 1000;

  function keyOf(select) {
    return select.getAttribute('data-filter');
  }

  function chosenValues() {
    const chosen = { type: '', area: '', status: '' };
    selects.forEach(function (select) {
      chosen[keyOf(select)] = select.value;
    });
    return chosen;
  }

  function matches(row, chosen) {
    const statuses = (row.getAttribute('data-statuses') || '').split(' ');
    return (
      (chosen.type === '' || row.getAttribute('data-type') === chosen.type) &&
      (chosen.area === '' || row.getAttribute('data-area') === chosen.area) &&
      (chosen.status === '' || statuses.indexOf(chosen.status) >= 0)
    );
  }

  // The choice goes to the address fragment, so a filtered view can be shared or reloaded.
  function writeFragment(chosen) {
    const parts = Object.keys(chosen)
      .filter(function (key) {
        return chosen[key] !== '';
      })
      .map(function (key) {
        return key + '=' + encodeURIComponent(chosen[key]);
      });
    const base = globalThis.location.pathname + globalThis.location.search;
    const address = parts.length === 0 ? base : base + '#' + parts.join('&');
    globalThis.history.replaceState(null, '', address);
  }

  function apply() {
    const chosen = chosenValues();
    let count = 0;
    rows.forEach(function (row) {
      const visible = matches(row, chosen);
      row.hidden = !visible;
      if (visible) count += 1;
    });
    if (wrap !== null) wrap.hidden = count === 0;
    empty.hidden = count !== 0;
    const noun = rows.length === 1 ? ' card' : ' cards';
    status.textContent = 'Showing ' + String(count) + ' of ' + String(rows.length) + noun;
  }

  function change() {
    apply();
    writeFragment(chosenValues());
  }

  // The start state: only a value that is an option of the select is taken, never the text itself.
  function readFragment() {
    const fragment = globalThis.location.hash.slice(1);
    if (fragment === '' || fragment.length > maxFragment) return;
    const params = new globalThis.URLSearchParams(fragment);
    selects.forEach(function (select) {
      const wanted = params.get(keyOf(select));
      if (wanted === null || wanted === '') return;
      const known = Array.from(select.options).some(function (option) {
        return option.value === wanted;
      });
      if (known) select.value = wanted;
    });
  }

  selects.forEach(function (select) {
    select.addEventListener('change', change);
  });
  if (reset !== null) {
    reset.addEventListener('click', function () {
      selects.forEach(function (select) {
        select.value = '';
      });
      change();
    });
  }

  readFragment();
  panel.hidden = false;
  apply();
})();
