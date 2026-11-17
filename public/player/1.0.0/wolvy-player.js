/*! Wolvy Player SDK - https://docs.wolvy.net/player-api/ */
(function wolvyPlayerSdk(root) {
  var TYPE = 'wolvy:player';
  var METHODS = [
    'play', 'pause', 'seek', 'mute', 'unmute', 'setVolume', 'setPlaybackRate', 'setQuality', 'setCaptions',
    'getCurrentTime', 'getDuration', 'getPaused', 'getMuted', 'getVolume', 'getPlaybackRate',
    'getQualities', 'getCaptions', 'getProgress'
  ];
  var EVENTS = [
    'ready', 'play', 'pause', 'ended', 'seeked', 'timeupdate', 'volumechange', 'ratechange',
    'qualitychange', 'captionschange', 'fullscreenchange', 'progress', 'error'
  ];
  var MESSAGES = {
    not_available: 'The Wolvy player did not answer. Check that the Player API is switched on for this account and that the video loaded.',
    timeout: 'The Wolvy player did not answer in time.',
    destroyed: 'This WolvyPlayer was destroyed.',
    play_blocked: 'The browser blocked play(). Start playback from a click, or mute the player first.',
    invalid_argument: 'The player refused that value.',
    not_supported: 'This player cannot do that on this device.',
    not_ready: 'The video has not loaded yet.',
    network_error: 'The video could not be loaded.',
    playback_error: 'The video could not be played.',
    device_not_supported: 'This device or browser cannot play this protected video.'
  };

  function fail(code, message) {
    var e = new Error(message || MESSAGES[code] || ('Wolvy player error: ' + code));
    e.name = 'WolvyPlayerError';
    e.code = code;
    return e;
  }

  function WolvyPlayer(target, options) {
    if (!(this instanceof WolvyPlayer)) return new WolvyPlayer(target, options);
    var el = typeof target === 'string' ? root.document.querySelector(target) : target;
    if (!el || String(el.tagName).toUpperCase() !== 'IFRAME') {
      throw fail('invalid_element', 'WolvyPlayer needs an <iframe> element, or a selector that matches one.');
    }
    options = options || {};
    var origin = options.origin;
    if (!origin) {
      try { origin = new URL(el.getAttribute('src') || '', root.location.href).origin; } catch (e) { origin = ''; }
    }
    if (!/^https?:\/\//.test(origin || '')) {
      throw fail('invalid_element', 'The iframe needs a Wolvy embed URL in its src.');
    }
    var self = this;
    this.element = el;
    this._origin = origin;
    this._seq = 0;
    this._pending = {};
    this._handlers = {};
    this._isReady = false;
    this._destroyed = false;
    this._timeout = options.timeout > 0 ? Number(options.timeout) : 15000;
    this._ready = new Promise(function (resolve, reject) { self._resolve = resolve; self._reject = reject; });
    this._ready.catch(function () {});
    this._timer = setTimeout(function () {
      if (!self._isReady) self._reject(fail('not_available'));
    }, this._timeout);
    this._onMessage = function (e) { self._receive(e); };
    this._onLoad = function () { self._ping(); };
    root.addEventListener('message', this._onMessage);
    el.addEventListener('load', this._onLoad);
    this._ping();
  }

  WolvyPlayer.prototype._post = function (msg) {
    try {
      var w = this.element.contentWindow;
      if (!w) return false;
      msg.type = TYPE;
      msg.v = 1;
      w.postMessage(msg, this._origin);
      return true;
    } catch (e) { return false; }
  };

  WolvyPlayer.prototype._send = function (method, value, timeout) {
    var self = this;
    return new Promise(function (resolve, reject) {
      if (self._destroyed) { reject(fail('destroyed')); return; }
      var id = ++self._seq;
      var timer = setTimeout(function () {
        delete self._pending[id];
        reject(fail('timeout'));
      }, timeout || 8000);
      self._pending[id] = { resolve: resolve, reject: reject, timer: timer };
      var msg = { id: id, method: method };
      if (value !== undefined) msg.value = value;
      if (!self._post(msg)) {
        clearTimeout(timer);
        delete self._pending[id];
        reject(fail('not_available'));
      }
    });
  };

  WolvyPlayer.prototype._ping = function () {
    var self = this;
    if (this._isReady || this._destroyed) return;
    this._send('ping', undefined, 4000).then(function (state) { self._markReady(state); }, function () {});
  };

  WolvyPlayer.prototype._markReady = function (state) {
    if (this._isReady || this._destroyed) return;
    this._isReady = true;
    clearTimeout(this._timer);
    this._resolve(state || {});
  };

  WolvyPlayer.prototype._receive = function (e) {
    if (this._destroyed || e.source !== this.element.contentWindow || e.origin !== this._origin) return;
    var d = e.data;
    if (!d || typeof d !== 'object' || d.type !== TYPE) return;
    if (typeof d.event === 'string') {
      if (EVENTS.indexOf(d.event) === -1) return;
      if (d.event === 'ready') this._markReady(d.data);
      if (d.event === 'error' && !this._isReady) {
        clearTimeout(this._timer);
        this._reject(fail(d.data && typeof d.data.code === 'string' ? d.data.code : 'playback_error'));
      }
      this._emit(d.event, d.data || {});
      return;
    }
    var p = this._pending[d.id];
    if (!p) return;
    delete this._pending[d.id];
    clearTimeout(p.timer);
    if (d.ok) p.resolve(d.value);
    else p.reject(fail(typeof d.error === 'string' ? d.error : 'failed'));
  };

  WolvyPlayer.prototype._emit = function (name, data) {
    var list = (this._handlers[name] || []).slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i].call(this, data); } catch (err) { setTimeout(function () { throw err; }, 0); }
    }
  };

  WolvyPlayer.prototype.ready = function () { return this._ready; };

  WolvyPlayer.prototype.on = function (name, fn) {
    if (EVENTS.indexOf(name) === -1) throw fail('invalid_event', 'Unknown event: ' + name);
    if (typeof fn !== 'function') throw fail('invalid_argument', 'on() needs a function.');
    (this._handlers[name] = this._handlers[name] || []).push(fn);
    return this;
  };

  WolvyPlayer.prototype.off = function (name, fn) {
    var list = this._handlers[name];
    if (!list) return this;
    if (!fn) { delete this._handlers[name]; return this; }
    this._handlers[name] = list.filter(function (h) { return h !== fn && h._wolvyOnce !== fn; });
    return this;
  };

  WolvyPlayer.prototype.once = function (name, fn) {
    var self = this;
    var wrapped = function (data) { self.off(name, wrapped); fn.call(self, data); };
    wrapped._wolvyOnce = fn;
    return this.on(name, wrapped);
  };

  WolvyPlayer.prototype.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;
    clearTimeout(this._timer);
    root.removeEventListener('message', this._onMessage);
    this.element.removeEventListener('load', this._onLoad);
    if (!this._isReady) this._reject(fail('destroyed'));
    for (var id in this._pending) {
      if (Object.prototype.hasOwnProperty.call(this._pending, id)) {
        clearTimeout(this._pending[id].timer);
        this._pending[id].reject(fail('destroyed'));
      }
    }
    this._pending = {};
    this._handlers = {};
  };

  METHODS.forEach(function (name) {
    WolvyPlayer.prototype[name] = function (value) {
      var self = this;
      return this._ready.then(function () { return self._send(name, value); });
    };
  });

  WolvyPlayer.EVENTS = EVENTS.slice();
  WolvyPlayer.METHODS = METHODS.slice();
  WolvyPlayer.version = '1.0.0';

  if (typeof module === 'object' && module && module.exports) module.exports = WolvyPlayer;
  root.WolvyPlayer = WolvyPlayer;
  return WolvyPlayer;
})(typeof window !== 'undefined' ? window : this);
