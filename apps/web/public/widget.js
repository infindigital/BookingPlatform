/*!
 * Universal Booking Widget — embeddable, framework-free.
 *
 * A single dependency-free script that renders a full booking flow inside a
 * Shadow DOM (so host-site CSS can never leak in or out) and talks ONLY to the
 * public JSON API (/api/v1/public/*), scoped by a publishable key. It never
 * touches a database and holds no secrets: the key identifies a business, the
 * backend re-validates and re-authorizes every request.
 *
 * Embed (inline):
 *   <script src="https://booking.example.com/widget.js" defer></script>
 *   <div data-booking-key="pk_live_xxx"></div>
 *
 * Embed (popup button):
 *   <button data-booking-key="pk_live_xxx" data-booking-mode="popup"
 *           data-booking-label="Book now"></button>
 *
 * Optional attributes: data-booking-base (API origin, defaults to the script's
 * origin), data-booking-service (preselect a service id), data-booking-primary
 * (override brand colour).
 *
 * Programmatic:
 *   BookingWidget.render(el, { publicKey, base?, serviceId?, primary? })
 *   BookingWidget.open({ publicKey, base?, serviceId?, primary? })   // modal
 */
(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.BookingWidget && window.BookingWidget.__loaded) return;

  // ---- Resolve the origin this script was served from (default API base). ----
  var SCRIPT_ORIGIN = (function () {
    try {
      var cur = document.currentScript;
      if (cur && cur.src) return new URL(cur.src).origin;
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        var s = scripts[i].src || '';
        if (s.indexOf('widget.js') !== -1) return new URL(s).origin;
      }
    } catch (e) {}
    return window.location.origin;
  })();

  var FONT_STACKS = {
    system: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    sans: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "'Georgia', 'Times New Roman', ui-serif, serif"
  };

  // ---------------------------- small helpers -------------------------------
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v == null) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c == null) continue;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  function money(amount, currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(amount);
    } catch (e) {
      return (currency || '') + ' ' + amount;
    }
  }

  function dayKeyOf(date, tz) {
    // "YYYY-MM-DD" in the business timezone.
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }

  function fmtTime(iso, tz) {
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  }

  function fmtDayLong(dayKey, tz) {
    // dayKey is a wall date; render it stably by anchoring at noon UTC.
    var d = new Date(dayKey + 'T12:00:00Z');
    return new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(d);
  }

  function fmtDayShort(dayKey) {
    var d = new Date(dayKey + 'T12:00:00Z');
    return {
      weekday: new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short' }).format(d),
      day: new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', day: 'numeric' }).format(d),
      month: new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short' }).format(d)
    };
  }

  function isEmail(v) {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
  }

  function locationSummary(loc) {
    var cityState = [loc.city, loc.state].filter(Boolean).join(', ');
    var locality = [cityState, loc.postalCode].filter(Boolean).join(' ').trim();
    return [loc.address, locality].filter(Boolean).join(' · ');
  }

  // ------------------------------- styles -----------------------------------
  function styleText() {
    return [
      ':host{all:initial;}',
      '*{box-sizing:border-box;}',
      '.bw{',
      '  --bw-primary:#4f46e5; --bw-radius:0.625rem;',
      '  --bw-fg:#0f172a; --bw-muted:#64748b; --bw-border:#e2e8f0;',
      '  --bw-bg:#ffffff; --bw-subtle:#f8fafc; --bw-danger:#dc2626;',
      '  font-family:var(--bw-font);color:var(--bw-fg);line-height:1.5;',
      '  background:var(--bw-bg);border:1px solid var(--bw-border);',
      '  border-radius:calc(var(--bw-radius) + 4px);padding:20px;',
      '  max-width:640px;width:100%;box-shadow:0 1px 2px rgba(15,23,42,.04);',
      '  -webkit-font-smoothing:antialiased;text-align:left;',
      '}',
      '.bw *{font-family:inherit;}',
      '.bw-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;}',
      '.bw-biz{font-size:15px;font-weight:600;}',
      '.bw-steps{display:flex;gap:6px;margin-bottom:18px;}',
      '.bw-steps span{height:4px;flex:1;border-radius:999px;background:var(--bw-border);}',
      '.bw-steps span.on{background:var(--bw-primary);}',
      '.bw-title{font-size:18px;font-weight:650;margin:0 0 4px;letter-spacing:-.01em;}',
      '.bw-sub{font-size:13px;color:var(--bw-muted);margin:0 0 14px;}',
      '.bw-list{display:flex;flex-direction:column;gap:8px;}',
      '.bw-card{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;text-align:left;',
      '  border:1px solid var(--bw-border);border-radius:var(--bw-radius);background:var(--bw-bg);',
      '  padding:12px 14px;cursor:pointer;transition:border-color .12s,background .12s;font-size:14px;color:inherit;}',
      '.bw-card:hover{border-color:var(--bw-primary);background:var(--bw-subtle);}',
      '.bw-card.sel{border-color:var(--bw-primary);box-shadow:0 0 0 1px var(--bw-primary) inset;}',
      '.bw-card-main{min-width:0;}',
      '.bw-card-name{font-weight:600;}',
      '.bw-card-desc{color:var(--bw-muted);font-size:12.5px;margin-top:2px;}',
      '.bw-card-meta{color:var(--bw-muted);font-size:12.5px;white-space:nowrap;}',
      '.bw-card-price{font-weight:600;color:var(--bw-fg);}',
      '.bw-days{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;margin-bottom:14px;scrollbar-width:thin;}',
      '.bw-day{flex:0 0 auto;min-width:64px;border:1px solid var(--bw-border);border-radius:var(--bw-radius);',
      '  background:var(--bw-bg);padding:8px 10px;text-align:center;cursor:pointer;color:inherit;}',
      '.bw-day:hover{border-color:var(--bw-primary);}',
      '.bw-day.sel{border-color:var(--bw-primary);background:var(--bw-primary);color:#fff;}',
      '.bw-day .wd{font-size:11px;text-transform:uppercase;letter-spacing:.04em;opacity:.75;}',
      '.bw-day .dn{font-size:18px;font-weight:650;line-height:1.1;}',
      '.bw-day .mo{font-size:11px;opacity:.75;}',
      '.bw-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px;}',
      '.bw-slot{border:1px solid var(--bw-border);border-radius:var(--bw-radius);background:var(--bw-bg);',
      '  padding:9px 6px;font-size:13px;font-weight:550;cursor:pointer;color:inherit;transition:border-color .12s;}',
      '.bw-slot:hover{border-color:var(--bw-primary);}',
      '.bw-slot.sel{border-color:var(--bw-primary);background:var(--bw-primary);color:#fff;}',
      '.bw-field{margin-bottom:12px;}',
      '.bw-label{display:block;font-size:12.5px;font-weight:550;color:var(--bw-muted);margin-bottom:5px;}',
      '.bw-input,.bw-select,.bw-textarea{width:100%;border:1px solid var(--bw-border);border-radius:var(--bw-radius);',
      '  background:var(--bw-bg);color:var(--bw-fg);padding:10px 12px;font-size:14px;outline:none;}',
      '.bw-input:focus,.bw-select:focus,.bw-textarea:focus{border-color:var(--bw-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--bw-primary) 18%,transparent);}',
      '.bw-row{display:flex;gap:10px;}',
      '.bw-row>*{flex:1;}',
      '.bw-actions{display:flex;justify-content:space-between;gap:10px;margin-top:18px;}',
      '.bw-btn{appearance:none;border:1px solid var(--bw-border);background:var(--bw-bg);color:var(--bw-fg);',
      '  border-radius:var(--bw-radius);padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;}',
      '.bw-btn:hover{background:var(--bw-subtle);}',
      '.bw-btn[disabled]{opacity:.5;cursor:not-allowed;}',
      '.bw-btn-primary{background:var(--bw-primary);border-color:var(--bw-primary);color:#fff;}',
      '.bw-btn-primary:hover{filter:brightness(.95);background:var(--bw-primary);}',
      '.bw-summary{border:1px solid var(--bw-border);border-radius:var(--bw-radius);background:var(--bw-subtle);padding:14px;font-size:14px;}',
      '.bw-summary div{display:flex;justify-content:space-between;gap:12px;padding:3px 0;}',
      '.bw-summary .k{color:var(--bw-muted);}',
      '.bw-summary .v{font-weight:550;text-align:right;}',
      '.bw-error{border:1px solid color-mix(in srgb,var(--bw-danger) 40%,transparent);background:color-mix(in srgb,var(--bw-danger) 8%,transparent);',
      '  color:var(--bw-danger);border-radius:var(--bw-radius);padding:9px 12px;font-size:13px;margin-bottom:12px;}',
      '.bw-empty{color:var(--bw-muted);font-size:13px;text-align:center;padding:22px 0;}',
      '.bw-center{text-align:center;padding:26px 10px;}',
      '.bw-check{width:52px;height:52px;border-radius:999px;background:color-mix(in srgb,var(--bw-primary) 12%,transparent);',
      '  color:var(--bw-primary);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:26px;}',
      '.bw-ref{display:inline-block;margin-top:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:16px;',
      '  font-weight:650;letter-spacing:.06em;background:var(--bw-subtle);border:1px solid var(--bw-border);border-radius:8px;padding:6px 12px;}',
      '.bw-spin{width:22px;height:22px;border:2.5px solid var(--bw-border);border-top-color:var(--bw-primary);',
      '  border-radius:999px;animation:bwspin .7s linear infinite;margin:26px auto;}',
      '@keyframes bwspin{to{transform:rotate(360deg);}}',
      '.bw-foot{margin-top:14px;text-align:center;font-size:11px;color:var(--bw-muted);}',
      '/* popup */',
      '.bw-overlay{position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:flex-start;',
      '  justify-content:center;padding:24px 12px;overflow-y:auto;z-index:2147483000;}',
      '.bw-overlay .bw{margin:24px auto;box-shadow:0 20px 50px rgba(15,23,42,.25);}',
      '.bw-x{appearance:none;border:none;background:transparent;color:var(--bw-muted);font-size:22px;line-height:1;cursor:pointer;padding:2px 6px;}',
      '.bw-launch{appearance:none;border:none;border-radius:var(--bw-radius);background:var(--bw-primary);color:#fff;',
      '  font-weight:600;font-size:14px;padding:11px 20px;cursor:pointer;font-family:var(--bw-font);}',
      '.bw-launch:hover{filter:brightness(.96);}',
      '@media (max-width:420px){.bw{padding:16px;}.bw-slots{grid-template-columns:repeat(auto-fill,minmax(74px,1fr));}}'
    ].join('\n');
  }

  // ------------------------------ API client --------------------------------
  function Api(base, key) {
    function req(path, opts) {
      opts = opts || {};
      var headers = { 'X-Public-Key': key };
      if (opts.body) headers['Content-Type'] = 'application/json';
      return fetch(base + '/api/v1/public' + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (json) {
          if (!res.ok) {
            var msg = (json && json.error && json.error.message) || ('Request failed (' + res.status + ')');
            var err = new Error(msg);
            err.status = res.status;
            throw err;
          }
          return json;
        });
      });
    }
    return {
      config: function () { return req('/config'); },
      availability: function (serviceId, employeeId, locationId, from, to) {
        var q = '?serviceId=' + encodeURIComponent(serviceId) + '&from=' + from + '&to=' + to;
        if (employeeId) q += '&employeeId=' + encodeURIComponent(employeeId);
        if (locationId) q += '&locationId=' + encodeURIComponent(locationId);
        return req('/availability' + q);
      },
      book: function (payload) { return req('/bookings', { method: 'POST', body: payload }); }
    };
  }

  // ------------------------------- Widget -----------------------------------
  function Widget(mount, options, onClose) {
    this.options = options || {};
    this.base = (this.options.base || SCRIPT_ORIGIN).replace(/\/$/, '');
    this.api = Api(this.base, this.options.publicKey);
    this.onClose = onClose || null;

    this.shadow = mount.attachShadow ? mount.attachShadow({ mode: 'open' }) : mount;
    this.shadow.appendChild(el('style', { text: styleText() }));
    this.root = el('div', { class: 'bw' });
    this.shadow.appendChild(this.root);

    this.state = {
      status: 'loading', // loading|ready|error
      error: null,
      config: null,
      step: 'service',
      serviceId: this.options.serviceId || null,
      employeeId: null, // null = any available
      locationId: null, // null = unspecified / single implicit location
      customerAddress: '', // required for a MOBILE location
      dayKey: null,
      startISO: null,
      slotEmployeeIds: [],
      days: [],
      daySlots: {}, // dayKey -> [{startISO,employeeIds}]
      loadingSlots: false,
      details: { firstName: '', lastName: '', email: '', phone: '', notes: '' },
      submitting: false,
      confirmation: null
    };

    this.load();
  }

  Widget.prototype.applyTheme = function (theme) {
    var primary = this.options.primary || (theme && theme.primary) || '#4f46e5';
    var radius = (theme && theme.radius) || '0.625rem';
    var font = FONT_STACKS[(theme && theme.font)] || FONT_STACKS.system;
    this.root.style.setProperty('--bw-primary', primary);
    this.root.style.setProperty('--bw-radius', radius);
    this.root.style.setProperty('--bw-font', font);
    // The overlay host (popup) also needs the font var.
    if (this.shadow.host && this.shadow.host.style) {
      this.shadow.host.style.setProperty('--bw-font', font);
    }
  };

  Widget.prototype.load = function () {
    var self = this;
    this.render();
    this.api.config().then(function (cfg) {
      self.state.config = cfg;
      self.applyTheme(cfg.theme);
      // Preselect the only service, or the requested one.
      if (self.state.serviceId && !cfg.services.some(function (s) { return s.id === self.state.serviceId; })) {
        self.state.serviceId = null;
      }
      if (!self.state.serviceId && cfg.services.length === 1) self.state.serviceId = cfg.services[0].id;
      // Auto-select a lone fixed (non-mobile) location so it needs no step.
      var locs = cfg.locations || [];
      if (locs.length === 1 && locs[0].mode !== 'MOBILE') self.state.locationId = locs[0].id;
      self.state.status = 'ready';
      if (self.state.serviceId) self.goToTime();
      else self.render();
    }).catch(function (err) {
      self.state.status = 'error';
      self.state.error = err.message || 'Unable to load the booking widget.';
      self.render();
    });
  };

  Widget.prototype.set = function (patch) {
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) this.state[k] = patch[k];
    this.render();
  };

  // ---- step navigation ----
  Widget.prototype.steps = function () {
    var cfg = this.state.config;
    var configured = (cfg && cfg.steps) || ['service', 'employee', 'datetime', 'details', 'confirm'];
    var svc = this.selectedService();
    var employeesForService = this.employeesForService();
    var showEmployee =
      configured.indexOf('employee') !== -1 &&
      cfg && cfg.settings && cfg.settings.allowAnyEmployee !== false &&
      employeesForService.length > 0;
    var locs = this.locations();
    var singleLocation = locs.length === 1 && locs[0].mode !== 'MOBILE' ? locs[0] : null;
    var showLocation = locs.length > 0 && !singleLocation;
    var flow = ['service'];
    if (showEmployee) flow.push('employee');
    if (showLocation) flow.push('location');
    flow.push('datetime', 'details', 'review');
    // If a service is preselected via options, the service step is skipped visually.
    return { flow: flow, showEmployee: showEmployee, showLocation: showLocation, singleLocation: singleLocation, svc: svc };
  };

  Widget.prototype.stepAfter = function (current) {
    var flow = this.steps().flow;
    return flow[flow.indexOf(current) + 1] || 'review';
  };

  Widget.prototype.stepBefore = function (current) {
    var flow = this.steps().flow;
    var i = flow.indexOf(current);
    var prev = i > 0 ? flow[i - 1] : null;
    if (prev === 'service' && this.options.serviceId) return null;
    return prev;
  };

  Widget.prototype.locations = function () {
    var cfg = this.state.config;
    return (cfg && cfg.locations) || [];
  };

  Widget.prototype.selectedLocation = function () {
    var self = this;
    var found = null;
    this.locations().forEach(function (l) { if (l.id === self.state.locationId) found = l; });
    return found;
  };

  // Locations valid for the current service (and chosen team member), honouring
  // the "no assignment rows = available everywhere" default.
  Widget.prototype.selectableLocations = function () {
    var self = this;
    var svc = this.selectedService();
    var emp = null;
    if (this.state.employeeId) {
      this.state.config.employees.forEach(function (e) { if (e.id === self.state.employeeId) emp = e; });
    }
    return this.locations().filter(function (loc) {
      var svcOk = !svc || !svc.locationIds || svc.locationIds.length === 0 || svc.locationIds.indexOf(loc.id) !== -1;
      var empOk = !emp || !emp.locationIds || emp.locationIds.length === 0 || emp.locationIds.indexOf(loc.id) !== -1;
      return svcOk && empOk;
    });
  };

  Widget.prototype.selectedService = function () {
    var cfg = this.state.config;
    if (!cfg || !this.state.serviceId) return null;
    for (var i = 0; i < cfg.services.length; i++) if (cfg.services[i].id === this.state.serviceId) return cfg.services[i];
    return null;
  };

  Widget.prototype.employeesForService = function () {
    var cfg = this.state.config;
    if (!cfg || !this.state.serviceId) return [];
    var sid = this.state.serviceId;
    return cfg.employees.filter(function (e) { return e.serviceIds.indexOf(sid) !== -1; });
  };

  Widget.prototype.goToTime = function () {
    // Build the upcoming day list from settings.daysAhead.
    var cfg = this.state.config;
    var tz = cfg.business.timezone || 'UTC';
    var daysAhead = (cfg.settings && cfg.settings.daysAhead) || 14;
    var days = [];
    var today = new Date();
    for (var i = 0; i < daysAhead; i++) {
      var d = new Date(today.getTime() + i * 86400000);
      days.push(dayKeyOf(d, tz));
    }
    this.state.days = days;
    this.state.dayKey = null;
    this.state.startISO = null;
    var s = this.steps();
    if (s.singleLocation) this.state.locationId = s.singleLocation.id;
    this.state.step = this.stepAfter('service');
    this.render();
  };

  Widget.prototype.selectDay = function (dayKey) {
    var self = this;
    this.state.dayKey = dayKey;
    this.state.startISO = null;
    if (this.state.daySlots[dayKey]) { this.render(); return; }
    this.state.loadingSlots = true;
    this.render();
    this.api.availability(this.state.serviceId, this.state.employeeId, this.state.locationId, dayKey, dayKey)
      .then(function (res) {
        var day = (res.days || []).filter(function (d) { return d.dayKey === dayKey; })[0];
        self.state.daySlots[dayKey] = (day && day.slots) || [];
        self.state.loadingSlots = false;
        self.render();
      })
      .catch(function (err) {
        self.state.loadingSlots = false;
        self.state.error = err.message;
        self.render();
      });
  };

  Widget.prototype.submit = function () {
    var self = this;
    var d = this.state.details;
    var start = new Date(this.state.startISO);
    var tz = this.state.config.business.timezone || 'UTC';
    var time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(start);
    var dayKey = dayKeyOf(start, tz);
    this.set({ submitting: true, error: null });
    var loc = this.selectedLocation();
    this.api.book({
      serviceId: this.state.serviceId,
      employeeId: this.state.employeeId,
      locationId: this.state.locationId,
      dayKey: dayKey,
      time: time,
      firstName: d.firstName.trim(),
      lastName: d.lastName.trim(),
      email: d.email.trim(),
      phone: d.phone.trim(),
      notes: d.notes.trim(),
      customerAddress: loc && loc.mode === 'MOBILE' ? (this.state.customerAddress || '').trim() : null
    }).then(function (res) {
      self.set({ submitting: false, confirmation: res.booking, step: 'done' });
    }).catch(function (err) {
      // A slot taken mid-flow: send them back to pick another time.
      var backToTime = err.status === 409;
      if (backToTime) self.state.daySlots[self.state.dayKey] = null;
      self.set({ submitting: false, error: err.message, step: backToTime ? 'datetime' : 'review' });
    });
  };

  // ------------------------------- render -----------------------------------
  Widget.prototype.render = function () {
    var s = this.state;
    this.root.innerHTML = '';

    if (s.status === 'loading') { this.root.appendChild(el('div', { class: 'bw-spin' })); this.mountFoot(); return; }
    if (s.status === 'error') {
      this.root.appendChild(el('div', { class: 'bw-error', text: s.error }));
      this.mountFoot();
      return;
    }

    var cfg = s.config;
    var info = this.steps();
    var flow = info.flow;
    var stepIndex = flow.indexOf(s.step === 'done' ? 'review' : s.step);

    // Header
    var head = el('div', { class: 'bw-head' }, [
      el('div', { class: 'bw-biz', text: cfg.business.name }),
      this.onClose ? el('button', { class: 'bw-x', 'aria-label': 'Close', onclick: this.onClose }, ['×']) : null
    ]);
    this.root.appendChild(head);

    if (s.step !== 'done') {
      var steps = el('div', { class: 'bw-steps' });
      for (var i = 0; i < flow.length; i++) steps.appendChild(el('span', { class: i <= stepIndex ? 'on' : '' }));
      this.root.appendChild(steps);
    }

    if (s.error && s.step !== 'done') this.root.appendChild(el('div', { class: 'bw-error', text: s.error }));

    if (s.step === 'service') this.renderService();
    else if (s.step === 'employee') this.renderEmployee();
    else if (s.step === 'location') this.renderLocation();
    else if (s.step === 'datetime') this.renderDateTime();
    else if (s.step === 'details') this.renderDetails();
    else if (s.step === 'review') this.renderReview();
    else if (s.step === 'done') this.renderDone();

    this.mountFoot();
  };

  Widget.prototype.mountFoot = function () {
    this.root.appendChild(el('div', { class: 'bw-foot' }, ['Powered by Booking']));
  };

  Widget.prototype.renderService = function () {
    var self = this;
    var cfg = this.state.config;
    var showPrices = !cfg.settings || cfg.settings.showPrices !== false;
    this.root.appendChild(el('h2', { class: 'bw-title', text: 'Choose a service' }));
    this.root.appendChild(el('p', { class: 'bw-sub', text: 'Select what you’d like to book.' }));
    if (!cfg.services.length) { this.root.appendChild(el('div', { class: 'bw-empty', text: 'No services are available right now.' })); return; }
    var list = el('div', { class: 'bw-list' });
    cfg.services.forEach(function (svc) {
      var meta = el('div', { class: 'bw-card-meta' }, [
        el('div', {}, [svc.durationMinutes + ' min']),
        showPrices ? el('div', { class: 'bw-card-price', text: svc.price > 0 ? money(svc.price, cfg.business.currency) : 'Free' }) : null
      ]);
      var card = el('button', {
        class: 'bw-card' + (self.state.serviceId === svc.id ? ' sel' : ''),
        type: 'button',
        onclick: function () { self.state.serviceId = svc.id; self.state.employeeId = null; self.state.locationId = null; self.state.customerAddress = ''; self.state.daySlots = {}; self.goToTime(); }
      }, [
        el('div', { class: 'bw-card-main' }, [
          el('div', { class: 'bw-card-name', text: svc.name }),
          svc.description ? el('div', { class: 'bw-card-desc', text: svc.description }) : null
        ]),
        meta
      ]);
      list.appendChild(card);
    });
    this.root.appendChild(list);
  };

  Widget.prototype.renderEmployee = function () {
    var self = this;
    var cfg = this.state.config;
    var employees = this.employeesForService();
    this.root.appendChild(el('h2', { class: 'bw-title', text: 'Choose your team member' }));
    this.root.appendChild(el('p', { class: 'bw-sub', text: 'Pick a preferred person, or let us assign anyone available.' }));
    var list = el('div', { class: 'bw-list' });

    function choose(id) {
      self.state.employeeId = id;
      self.state.locationId = null;
      self.state.customerAddress = '';
      self.state.daySlots = {};
      self.state.dayKey = null;
      self.state.startISO = null;
      self.set({ step: self.stepAfter('employee') });
    }
    list.appendChild(el('button', {
      class: 'bw-card' + (self.state.employeeId == null ? ' sel' : ''), type: 'button',
      onclick: function () { choose(null); }
    }, [el('div', { class: 'bw-card-main' }, [el('div', { class: 'bw-card-name', text: 'Any available' }), el('div', { class: 'bw-card-desc', text: 'First free team member' })])]));

    employees.forEach(function (e) {
      list.appendChild(el('button', {
        class: 'bw-card' + (self.state.employeeId === e.id ? ' sel' : ''), type: 'button',
        onclick: function () { choose(e.id); }
      }, [el('div', { class: 'bw-card-main' }, [
        el('div', { class: 'bw-card-name', text: e.name }),
        e.title ? el('div', { class: 'bw-card-desc', text: e.title }) : null
      ])]));
    });
    this.root.appendChild(list);
    this.root.appendChild(this.nav(this.stepBefore('employee'), null));
  };

  Widget.prototype.renderLocation = function () {
    var self = this;
    this.root.appendChild(el('h2', { class: 'bw-title', text: 'Choose a location' }));
    this.root.appendChild(el('p', { class: 'bw-sub', text: 'Where should this appointment take place?' }));

    var locs = this.selectableLocations();
    if (!locs.length) {
      this.root.appendChild(el('div', { class: 'bw-empty', text: 'No locations available for this selection.' }));
      this.root.appendChild(this.nav(this.stepBefore('location'), null));
      return;
    }

    var list = el('div', { class: 'bw-list' });
    locs.forEach(function (loc) {
      var summary = locationSummary(loc);
      list.appendChild(el('button', {
        class: 'bw-card' + (self.state.locationId === loc.id ? ' sel' : ''), type: 'button',
        onclick: function () {
          self.state.locationId = loc.id;
          self.state.daySlots = {};
          self.state.dayKey = null;
          self.state.startISO = null;
          if (loc.mode === 'MOBILE') self.render(); // stay to collect the address
          else self.set({ step: self.stepAfter('location') });
        }
      }, [el('div', { class: 'bw-card-main' }, [
        el('div', { class: 'bw-card-name', text: loc.name }),
        summary ? el('div', { class: 'bw-card-desc', text: summary }) : null,
        loc.mode === 'MOBILE' ? el('div', { class: 'bw-card-desc', text: 'We come to you' }) : null
      ])]));
    });
    this.root.appendChild(list);

    var chosen = this.selectedLocation();
    if (chosen && chosen.mode === 'MOBILE') {
      var input = el('textarea', { class: 'bw-textarea', rows: '2', placeholder: 'Street address we should come to' });
      input.value = this.state.customerAddress;
      input.addEventListener('input', function () {
        self.state.customerAddress = input.value;
        if (self._locNext) self._locNext.disabled = !self.state.customerAddress.trim();
      });
      this.root.appendChild(el('div', { class: 'bw-field', style: 'margin-top:10px;' }, [
        el('label', { class: 'bw-label', text: 'Your address *' }), input
      ]));
      var nav = this.nav(this.stepBefore('location'), function () { self.set({ step: self.stepAfter('location') }); }, 'Continue');
      this._locNext = nav.querySelector('.bw-btn-primary');
      this.root.appendChild(nav);
      this._locNext.disabled = !this.state.customerAddress.trim();
    } else {
      this.root.appendChild(this.nav(this.stepBefore('location'), null));
    }
  };

  Widget.prototype.renderDateTime = function () {
    var self = this;
    var cfg = this.state.config;
    var tz = cfg.business.timezone || 'UTC';
    this.root.appendChild(el('h2', { class: 'bw-title', text: 'Pick a date & time' }));
    this.root.appendChild(el('p', { class: 'bw-sub', text: 'Times shown in ' + tz + '.' }));

    var strip = el('div', { class: 'bw-days' });
    this.state.days.forEach(function (dk) {
      var parts = fmtDayShort(dk);
      strip.appendChild(el('button', {
        class: 'bw-day' + (self.state.dayKey === dk ? ' sel' : ''), type: 'button',
        onclick: function () { self.selectDay(dk); }
      }, [
        el('div', { class: 'wd', text: parts.weekday }),
        el('div', { class: 'dn', text: parts.day }),
        el('div', { class: 'mo', text: parts.month })
      ]));
    });
    this.root.appendChild(strip);

    if (!this.state.dayKey) {
      this.root.appendChild(el('div', { class: 'bw-empty', text: 'Select a day to see available times.' }));
    } else if (this.state.loadingSlots) {
      this.root.appendChild(el('div', { class: 'bw-spin' }));
    } else {
      var slots = this.state.daySlots[this.state.dayKey] || [];
      if (!slots.length) {
        this.root.appendChild(el('div', { class: 'bw-empty', text: 'No times available on ' + fmtDayLong(this.state.dayKey, tz) + '.' }));
      } else {
        var grid = el('div', { class: 'bw-slots' });
        slots.forEach(function (slot) {
          grid.appendChild(el('button', {
            class: 'bw-slot' + (self.state.startISO === slot.startISO ? ' sel' : ''), type: 'button',
            onclick: function () { self.state.startISO = slot.startISO; self.state.slotEmployeeIds = slot.employeeIds; self.set({ step: 'details' }); }
          }, [fmtTime(slot.startISO, tz)]));
        });
        this.root.appendChild(grid);
      }
    }
    this.root.appendChild(this.nav(this.stepBefore('datetime'), null));
  };

  Widget.prototype.renderDetails = function () {
    var self = this;
    var cfg = this.state.config;
    var d = this.state.details;
    var requirePhone = cfg.settings && cfg.settings.requirePhone;
    this.root.appendChild(el('h2', { class: 'bw-title', text: 'Your details' }));
    this.root.appendChild(el('p', { class: 'bw-sub', text: 'We’ll send your confirmation here.' }));

    function field(label, key, type, required, placeholder) {
      var input = el(type === 'textarea' ? 'textarea' : 'input', {
        class: type === 'textarea' ? 'bw-textarea' : 'bw-input',
        type: type === 'textarea' ? null : (type || 'text'),
        rows: type === 'textarea' ? '2' : null,
        placeholder: placeholder || '',
        value: d[key]
      });
      input.value = d[key];
      input.addEventListener('input', function () { d[key] = input.value; self.updateDetailsButton(); });
      return el('div', { class: 'bw-field' }, [el('label', { class: 'bw-label', text: label + (required ? ' *' : '') }), input]);
    }

    this.root.appendChild(el('div', { class: 'bw-row' }, [
      field('First name', 'firstName', 'text', true),
      field('Last name', 'lastName', 'text', false)
    ]));
    this.root.appendChild(field('Email', 'email', 'email', true, 'you@example.com'));
    this.root.appendChild(field('Phone', 'phone', 'tel', requirePhone, requirePhone ? 'Required' : 'Optional'));
    this.root.appendChild(field('Notes', 'notes', 'textarea', false, 'Anything we should know? (optional)'));

    var back = 'datetime';
    var nav = this.nav(back, function () { self.set({ step: 'review', error: null }); }, 'Continue');
    this._detailsNext = nav.querySelector('.bw-btn-primary');
    this.root.appendChild(nav);
    this.updateDetailsButton();
  };

  Widget.prototype.detailsValid = function () {
    var d = this.state.details;
    var cfg = this.state.config;
    var requirePhone = cfg.settings && cfg.settings.requirePhone;
    if (!d.firstName.trim()) return false;
    if (!isEmail(d.email.trim())) return false;
    if (requirePhone && !d.phone.trim()) return false;
    return true;
  };

  Widget.prototype.updateDetailsButton = function () {
    if (this._detailsNext) this._detailsNext.disabled = !this.detailsValid();
  };

  Widget.prototype.renderReview = function () {
    var self = this;
    var cfg = this.state.config;
    var tz = cfg.business.timezone || 'UTC';
    var svc = this.selectedService();
    var d = this.state.details;
    var emp = null;
    if (this.state.employeeId) {
      cfg.employees.forEach(function (e) { if (e.id === self.state.employeeId) emp = e.name; });
    }
    this.root.appendChild(el('h2', { class: 'bw-title', text: 'Review & confirm' }));
    this.root.appendChild(el('p', { class: 'bw-sub', text: 'Please check everything looks right.' }));

    var loc = this.selectedLocation();
    var rows = [
      ['Service', svc ? svc.name : ''],
      ['Date', fmtDayLong(dayKeyOf(new Date(this.state.startISO), tz), tz)],
      ['Time', fmtTime(this.state.startISO, tz) + ' (' + tz + ')'],
      ['Team member', emp || 'Any available']
    ];
    if (loc) rows.push(['Location', loc.name]);
    if (loc && loc.mode === 'MOBILE' && this.state.customerAddress.trim()) rows.push(['Address', this.state.customerAddress.trim()]);
    rows.push(['Name', (d.firstName + ' ' + d.lastName).trim()]);
    rows.push(['Email', d.email.trim()]);
    if (d.phone.trim()) rows.push(['Phone', d.phone.trim()]);
    if (svc && (!cfg.settings || cfg.settings.showPrices !== false)) {
      rows.push(['Price', svc.price > 0 ? money(svc.price, cfg.business.currency) : 'Free']);
    }
    var summary = el('div', { class: 'bw-summary' });
    rows.forEach(function (r) {
      summary.appendChild(el('div', {}, [el('span', { class: 'k', text: r[0] }), el('span', { class: 'v', text: r[1] })]));
    });
    this.root.appendChild(summary);

    var nav = this.nav('details', function () { self.submit(); }, this.state.submitting ? 'Booking…' : 'Confirm booking');
    if (this.state.submitting) nav.querySelector('.bw-btn-primary').disabled = true;
    this.root.appendChild(nav);
  };

  Widget.prototype.renderDone = function () {
    var cfg = this.state.config;
    var c = this.state.confirmation;
    var tz = c.timezone || cfg.business.timezone || 'UTC';
    var wrap = el('div', { class: 'bw-center' });
    wrap.appendChild(el('div', { class: 'bw-check', html: '✓' }));
    wrap.appendChild(el('h2', { class: 'bw-title', text: 'Request received' }));
    var msg = (cfg.settings && cfg.settings.confirmationMessage) ||
      'Thanks, ' + (this.state.details.firstName || 'there') + '! Your booking is pending confirmation.';
    wrap.appendChild(el('p', { class: 'bw-sub', text: msg }));
    var summary = el('div', { class: 'bw-summary', style: 'text-align:left;margin-top:6px;' }, [
      el('div', {}, [el('span', { class: 'k', text: c.serviceName }), el('span', { class: 'v', text: fmtTime(c.startISO, tz) })]),
      el('div', {}, [el('span', { class: 'k', text: fmtDayLong(dayKeyOf(new Date(c.startISO), tz), tz) }), el('span', { class: 'v', text: c.employeeName || 'Any available' })])
    ]);
    if (c.locationName) {
      summary.appendChild(el('div', {}, [el('span', { class: 'k', text: 'Location' }), el('span', { class: 'v', text: c.locationName })]));
    }
    wrap.appendChild(summary);
    wrap.appendChild(el('div', { class: 'bw-ref', text: c.reference }));
    if (c.amountDue > 0) {
      wrap.appendChild(el('p', { class: 'bw-sub', style: 'margin-top:12px;', text: 'Amount due: ' + money(c.amountDue, c.currency) }));
    }
    this.root.appendChild(wrap);
    if (this.onClose) {
      var self = this;
      this.root.appendChild(el('div', { class: 'bw-actions', style: 'justify-content:center;' }, [
        el('button', { class: 'bw-btn bw-btn-primary', type: 'button', onclick: self.onClose }, ['Done'])
      ]));
    }
  };

  // Back/next action bar. `back` is a step key (or null to hide back).
  Widget.prototype.nav = function (back, next, nextLabel) {
    var self = this;
    var left = back
      ? el('button', { class: 'bw-btn', type: 'button', onclick: function () { self.set({ step: back, error: null }); } }, ['← Back'])
      : el('span');
    var right = next
      ? el('button', { class: 'bw-btn bw-btn-primary', type: 'button', onclick: next }, [nextLabel || 'Continue'])
      : el('span');
    return el('div', { class: 'bw-actions' }, [left, right]);
  };

  // ------------------------------ bootstrap ---------------------------------
  function optionsFromEl(node) {
    return {
      publicKey: node.getAttribute('data-booking-key'),
      base: node.getAttribute('data-booking-base') || undefined,
      serviceId: node.getAttribute('data-booking-service') || undefined,
      primary: node.getAttribute('data-booking-primary') || undefined,
      mode: node.getAttribute('data-booking-mode') || 'inline',
      label: node.getAttribute('data-booking-label') || 'Book now'
    };
  }

  function openModal(options) {
    var host = el('div');
    // Host carries the font var so the overlay inherits it before config loads.
    var shadow = host.attachShadow({ mode: 'open' });
    shadow.appendChild(el('style', { text: styleText() }));
    var overlay = el('div', { class: 'bw-overlay' });
    var panel = el('div');
    overlay.appendChild(panel);
    shadow.appendChild(overlay);
    document.body.appendChild(host);

    function close() {
      document.removeEventListener('keydown', onKey);
      if (host.parentNode) host.parentNode.removeChild(host);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    // Mount the widget inside the panel (its own shadow root within panel).
    new Widget(panel, options, close);
    return { close: close };
  }

  function render(node, options) {
    if (!options.publicKey) {
      // eslint-disable-next-line no-console
      console.warn('[BookingWidget] missing data-booking-key / publicKey');
      return;
    }
    if (options.mode === 'popup') {
      var btn = el('button', { class: 'bw-launch', type: 'button', text: options.label });
      // Wrap the launcher in a shadow root so its style is isolated too. The
      // launcher renders BEFORE any /config call, so seed its brand tokens with
      // sensible defaults (overridable via data-booking-primary); the modal it
      // opens themes itself fully once config loads.
      var host = el('div');
      var shadow = host.attachShadow({ mode: 'open' });
      shadow.appendChild(el('style', { text: styleText() }));
      btn.style.setProperty('--bw-primary', options.primary || '#4f46e5');
      btn.style.setProperty('--bw-radius', '0.625rem');
      btn.style.setProperty('--bw-font', FONT_STACKS.system);
      btn.addEventListener('click', function () { openModal(options); });
      shadow.appendChild(btn);
      node.appendChild(host);
      return { open: function () { return openModal(options); } };
    }
    return new Widget(node, options);
  }

  function autoInit() {
    var nodes = document.querySelectorAll('[data-booking-key]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.getAttribute('data-booking-init') === '1') continue;
      node.setAttribute('data-booking-init', '1');
      render(node, optionsFromEl(node));
    }
  }

  var API = {
    __loaded: true,
    render: function (node, options) { return render(node, options || {}); },
    open: function (options) { return openModal(options || {}); },
    init: autoInit
  };
  window.BookingWidget = API;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
