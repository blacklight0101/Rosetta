// Rosetta run replay (RF-506). A classic script loaded deferred by replay.html: without it the page
// is the whole timeline as a list. With it the reader can play the run, pause, step and restart.
// It reads nothing but the attributes the page was written with and changes nothing but the
// `hidden` and `aria-current` attributes and the status text: no markup is built from text (RF-507).
(function () {
  'use strict';

  const doc = globalThis.document;
  const list = doc.querySelector('[data-replay-steps]');
  const controls = doc.querySelector('[data-replay-controls]');
  const status = doc.querySelector('[data-replay-status]');
  if (list === null || controls === null || status === null) return;

  const items = Array.from(list.children);
  const total = items.length;
  const interval = Number(list.getAttribute('data-interval')) || 700;
  const button = (action) => controls.querySelector('[data-action="' + action + '"]');
  const playButton = button('play');
  const pauseButton = button('pause');
  if (playButton === null || pauseButton === null) return;

  let shown = total;
  let timer = null;

  function describe() {
    const last = shown > 0 ? items[shown - 1] : undefined;
    const cost = last === undefined ? '' : ', cost ' + last.getAttribute('data-cost');
    return 'Showing ' + String(shown) + ' of ' + String(total) + ' steps' + cost;
  }

  function render() {
    items.forEach(function (item, index) {
      item.hidden = index >= shown;
      if (index === shown - 1) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    status.textContent = describe();
    playButton.disabled = timer !== null;
    pauseButton.disabled = timer === null;
  }

  function stop() {
    if (timer !== null) globalThis.clearInterval(timer);
    timer = null;
  }

  function advance() {
    if (shown < total) shown += 1;
    if (shown >= total) stop();
    render();
  }

  function play() {
    stop();
    if (shown >= total) shown = 0;
    timer = globalThis.setInterval(advance, interval);
    render();
    advance();
  }

  function step() {
    stop();
    if (shown >= total) shown = 0;
    advance();
  }

  function restart() {
    stop();
    shown = 0;
    render();
  }

  const actions = {
    play: play,
    pause: function () {
      stop();
      render();
    },
    step: step,
    restart: restart,
  };
  Object.keys(actions).forEach(function (name) {
    const target = button(name);
    if (target !== null) target.addEventListener('click', actions[name]);
  });

  controls.hidden = false;
  render();
})();
