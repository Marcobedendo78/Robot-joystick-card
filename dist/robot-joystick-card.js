
const DEFAULT_ROBOT_IMAGE = "/hacsfiles/Robot-joystick-card/Robot.jpg";

class RobotJoystickCard extends HTMLElement {
  static getStubConfig() {
    return {
      type: "custom:robot-joystick-card",
      title: "Robot Tagliaerba",
    };
  }

  setConfig(config) {
    if (!config) {
      throw new Error("Configurazione non valida");
    }

    this.config = {
      title: "Robot Tagliaerba",
      topic: "home/robot/mower/control/joystick",
      command_topic: "home/robot/mower/control",
      timer_command_topic: "home/robot/mower/control/timers",

      max_distance: 110,
      deadzone: 0.06,
      publish_interval: 40,

      battery_entity: "sensor.mower_battery",
      battery_amps_entity: "sensor.robotmowerbatteryamps",
      charge_entity: "sensor.mower_charge",
      loop_entity: "sensor.mower_loop",
      running_entity: "sensor.mower_running",
      parked_entity: "sensor.mower_parked",
      docked_entity: "sensor.mower_docked",
      tracking_entity: "sensor.mower_tracking",

      robot_image: DEFAULT_ROBOT_IMAGE,
      batt_min_voltage: 28.0,
      batt_max_voltage: 33.6,

      timer_count: 6,

      timer1_hour_entity: "",
      timer1_minute_entity: "",
      timer1_enabled_entity: "",
      timer1_action_entity: "",

      timer2_hour_entity: "",
      timer2_minute_entity: "",
      timer2_enabled_entity: "",
      timer2_action_entity: "",

      timer3_hour_entity: "",
      timer3_minute_entity: "",
      timer3_enabled_entity: "",
      timer3_action_entity: "",

      timer4_hour_entity: "",
      timer4_minute_entity: "",
      timer4_enabled_entity: "",
      timer4_action_entity: "",

      timer5_hour_entity: "",
      timer5_minute_entity: "",
      timer5_enabled_entity: "",
      timer5_action_entity: "",

      timer6_hour_entity: "",
      timer6_minute_entity: "",
      timer6_enabled_entity: "",
      timer6_action_entity: "",

      ...config,
    };

    this._ensureRuntimeState();
  }

  set hass(hass) {
    this._hass = hass;

    if (!this.content) {
      this._renderCard();
    }

    this._syncTimersFromEntitiesOrStorage();
    this._updateStates();
    this._refreshTimerUI();
  }

  getCardSize() {
    return 12;
  }

  disconnectedCallback() {
    this._stopGrassAnimation(true);
  }

  _ensureRuntimeState() {
    if (typeof this.timerPanelOpen !== "boolean") this.timerPanelOpen = false;
    if (typeof this.joystickPanelOpen !== "boolean") this.joystickPanelOpen = false;

    if (!this.timerState) {
      this.timerState = this._loadTimerState();
    }

    if (!this.state) {
      this.state = { x: 0, y: 0, left: 0, right: 0, active: 0 };
    }

    if (!this.lastPublish) this.lastPublish = 0;
  }

  _storageKey() {
    return "robot-joystick-card-timers-v3";
  }

  _defaultTimerState() {
    const count = Math.max(1, Math.min(8, Number(this.config?.timer_count || 6)));
    const timers = [];
    for (let i = 1; i <= count; i += 1) {
      timers.push({
        id: i,
        hour: 8,
        minute: 0,
        enabled: 0,
        action: 1,
      });
    }
    return { timers };
  }

  _loadTimerState() {
    try {
      const raw = localStorage.getItem(this._storageKey());
      if (!raw) return this._defaultTimerState();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.timers)) return this._defaultTimerState();

      const defaults = this._defaultTimerState();
      return {
        timers: defaults.timers.map((t) => {
          const found = parsed.timers.find((x) => Number(x.id) === Number(t.id));
          return found ? { ...t, ...found } : t;
        }),
      };
    } catch (_err) {
      return this._defaultTimerState();
    }
  }

  _saveTimerState() {
    try {
      localStorage.setItem(this._storageKey(), JSON.stringify(this.timerState));
    } catch (_err) {
      // ignore
    }
  }

  _getState(entityId) {
    return this._hass?.states?.[entityId]?.state ?? "-";
  }

  _getNumericState(entityId, fallback = NaN) {
    const value = parseFloat(this._getState(entityId));
    return Number.isNaN(value) ? fallback : value;
  }

  _normalizeState(val) {
    return String(val ?? "").trim().toLowerCase();
  }

  _isTruthyState(val) {
    const state = this._normalizeState(val);
    return [
      "1",
      "on",
      "true",
      "yes",
      "si",
      "sì",
      "in carica",
      "in base",
      "parcheggiato",
      "falciatura",
      "tracciatura filo",
      "tracking",
      "attivo",
      "active",
      "online",
    ].includes(state);
  }

  _getBatteryPercentage(voltage) {
    const min = Number(this.config.batt_min_voltage ?? 28.0);
    const max = Number(this.config.batt_max_voltage ?? 33.6);
    const value = Number(voltage);
    if (Number.isNaN(value)) return 0;
    let pct = ((value - min) / (max - min)) * 100;
    pct = Math.max(0, Math.min(100, pct));
    return Math.round(pct);
  }

  _getBatteryBars(percentage) {
    if (percentage >= 90) return 5;
    if (percentage >= 70) return 4;
    if (percentage >= 50) return 3;
    if (percentage >= 30) return 2;
    if (percentage >= 10) return 1;
    return 0;
  }

  _renderBatteryIcon(percentage) {
    const bars = this._getBatteryBars(percentage);
    const cls = percentage <= 15 ? "low" : percentage <= 35 ? "mid" : "";
    return `
      <div class="battery-shell ${cls}">
        <div class="battery-tip"></div>
        <div class="battery-bars">
          ${[1, 2, 3, 4, 5]
            .map((n) => `<span class="battery-bar ${bars >= n ? "on" : ""}"></span>`)
            .join("")}
        </div>
      </div>
    `;
  }

  _getRobotMode() {
    const chargeState = this._getState(this.config.charge_entity);
    const dockedState = this._getState(this.config.docked_entity);
    const parkedState = this._getState(this.config.parked_entity);
    const runningState = this._getState(this.config.running_entity);
    const trackingState = this._getState(this.config.tracking_entity);

    const charging =
      this._normalizeState(chargeState) === "in carica" ||
      this._normalizeState(dockedState) === "in base" ||
      this._isTruthyState(chargeState) ||
      this._isTruthyState(dockedState);

    const parked =
      this._normalizeState(parkedState) === "parcheggiato" ||
      this._isTruthyState(parkedState);

    const mowing =
      this._normalizeState(runningState) === "falciatura" ||
      this._isTruthyState(runningState);

    const tracking =
      this._normalizeState(trackingState) === "tracciatura filo" ||
      this._isTruthyState(trackingState);

    if (charging) {
      return {
        code: "charging",
        label: "In carica",
        sublabel: "Robot in base",
        animate: false,
        panelOff: true,
      };
    }

    if (parked) {
      return {
        code: "parked",
        label: "Parcheggiato",
        sublabel: "Robot fermo",
        animate: false,
        panelOff: true,
      };
    }

    if (mowing) {
      return {
        code: "mowing",
        label: "Falciatura",
        sublabel: "Robot in lavoro",
        animate: true,
        panelOff: false,
      };
    }

    if (tracking) {
      return {
        code: "tracking",
        label: "Tracking",
        sublabel: "Tracciatura filo",
        animate: false,
        panelOff: true,
      };
    }

    return {
      code: "idle",
      label: "Idle",
      sublabel: "In attesa",
      animate: false,
      panelOff: true,
    };
  }

  _sendCommand(command) {
    if (!this._hass) return;
    this._hass.callService("mqtt", "publish", {
      topic: this.config.command_topic,
      payload: command,
      qos: 0,
      retain: false,
    });
  }

  _publishTimerPayload() {
    if (!this._hass) return;

    const payload = {
      type: "set_timers",
      source: "robot_joystick_card",
      save: 1,
      timers: this.timerState.timers.map((t) => ({
        id: t.id,
        hour: Number(t.hour),
        minute: Number(t.minute),
        enabled: Number(t.enabled),
        action: Number(t.action),
      })),
    };

    this._hass.callService("mqtt", "publish", {
      topic: this.config.timer_command_topic || this.config.command_topic,
      payload: JSON.stringify(payload),
      qos: 0,
      retain: false,
    });
  }

  _getTimerEntityValue(timerId, field) {
    const entityId = this.config[`timer${timerId}_${field}_entity`];
    if (!entityId) return null;
    const raw = this._getState(entityId);
    if (raw === "-" || raw === "" || raw == null) return null;
    return raw;
  }

  _syncTimersFromEntitiesOrStorage() {
    if (!this.timerState?.timers?.length) {
      this.timerState = this._defaultTimerState();
    }

    let changed = false;

    this.timerState.timers = this.timerState.timers.map((timer) => {
      const hourRaw = this._getTimerEntityValue(timer.id, "hour");
      const minuteRaw = this._getTimerEntityValue(timer.id, "minute");
      const enabledRaw = this._getTimerEntityValue(timer.id, "enabled");
      const actionRaw = this._getTimerEntityValue(timer.id, "action");

      const hasRemoteData =
        hourRaw !== null || minuteRaw !== null || enabledRaw !== null || actionRaw !== null;

      if (!hasRemoteData) return timer;

      changed = true;

      return {
        ...timer,
        hour: hourRaw !== null ? this._clampInt(hourRaw, 0, 23, timer.hour) : timer.hour,
        minute:
          minuteRaw !== null ? this._clampInt(minuteRaw, 0, 59, timer.minute) : timer.minute,
        enabled:
          enabledRaw !== null
            ? this._parseEnabledValue(enabledRaw, timer.enabled)
            : timer.enabled,
        action:
          actionRaw !== null ? this._clampInt(actionRaw, 1, 5, timer.action) : timer.action,
      };
    });

    if (changed) {
      this._saveTimerState();
    }
  }

  _clampInt(val, min, max, fallback = 0) {
    const n = parseInt(val, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  _parseEnabledValue(val, fallback = 0) {
    const norm = this._normalizeState(val);
    if (["1", "on", "true", "yes", "si", "sì", "attivo", "active"].includes(norm)) return 1;
    if (["0", "off", "false", "no", "disattivo", "inactive"].includes(norm)) return 0;
    return fallback;
  }

  _startGrassAnimation() {
    if (this._grassTimer || !this.statusEls?.grassCut) return;

    const duration = 4800;
    const loopStart = performance.now();

    const animate = (now) => {
      if (!this.statusEls?.grassCut) {
        this._grassTimer = null;
        return;
      }

      const elapsed = (now - loopStart) % duration;
      const progress = elapsed / duration;
      const percent = Math.max(0, Math.min(100, progress * 100));
      this.statusEls.grassCut.style.width = `${percent}%`;
      this._grassTimer = requestAnimationFrame(animate);
    };

    this._grassTimer = requestAnimationFrame(animate);
  }

  _stopGrassAnimation(reset = false) {
    if (this._grassTimer) {
      cancelAnimationFrame(this._grassTimer);
      this._grassTimer = null;
    }
    if (this.statusEls?.grassCut && reset) {
      this.statusEls.grassCut.style.width = "0%";
    }
  }

  _buildNumberOptions(start, end, step = 1, selected = null) {
    const out = [];
    for (let i = start; i <= end; i += step) {
      const label = String(i).padStart(2, "0");
      out.push(
        `<option value="${i}" ${Number(selected) === i ? "selected" : ""}>${label}</option>`
      );
    }
    return out.join("");
  }

  _buildActionOptions(selected = 1) {
    const actions = [
      { value: 1, label: "Uscita Z1" },
      { value: 2, label: "Uscita Z2" },
      { value: 3, label: "Taglia sul filo" },
      { value: 4, label: "Partenza rapida" },
      { value: 5, label: "Custom" },
    ];

    return actions
      .map(
        (a) =>
          `<option value="${a.value}" ${Number(selected) === a.value ? "selected" : ""}>${a.label}</option>`
      )
      .join("");
  }

  _actionLabel(action) {
    const map = {
      1: "Uscita Z1",
      2: "Uscita Z2",
      3: "Taglia sul filo",
      4: "Partenza rapida",
      5: "Custom",
    };
    return map[Number(action)] || "Custom";
  }

  _iconStart() {
    return `
      <svg viewBox="0 0 24 24" class="btn-icon" aria-hidden="true">
        <path d="M8 6L18 12L8 18Z" fill="currentColor"></path>
      </svg>
    `;
  }

  _iconStop() {
    return `
      <svg viewBox="0 0 24 24" class="btn-icon" aria-hidden="true">
        <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"></rect>
      </svg>
    `;
  }

  _iconExitDock() {
    return `
      <svg viewBox="0 0 24 24" class="btn-icon" aria-hidden="true">
        <path d="M4 17H14" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
        <path d="M6 17V13H12V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>
        <path d="M13 7H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
        <path d="M16 4L20 7L16 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>
      </svg>
    `;
  }

  _iconDock() {
    return `
      <svg viewBox="0 0 24 24" class="btn-icon" aria-hidden="true">
        <path d="M5 11L12 5L19 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>
        <path d="M7 10.5V18H17V10.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>
        <path d="M10 18V14H14V18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>
      </svg>
    `;
  }

  _iconManual() {
    return `
      <svg viewBox="0 0 24 24" class="btn-icon" aria-hidden="true">
        <path d="M7 10H17C19.2 10 21 11.8 21 14C21 16.2 19.2 18 17 18H7C4.8 18 3 16.2 3 14C3 11.8 4.8 10 7 10Z" stroke="currentColor" stroke-width="2" fill="none"></path>
        <circle cx="9" cy="14" r="1.5" fill="currentColor"></circle>
        <circle cx="15.5" cy="13" r="1.2" fill="currentColor"></circle>
        <circle cx="18" cy="15" r="1.2" fill="currentColor"></circle>
        <path d="M9 7V11" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
        <path d="M7 9H11" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
      </svg>
    `;
  }

  _iconAuto() {
    return `
      <svg viewBox="0 0 24 24" class="btn-icon" aria-hidden="true">
        <rect x="7" y="7" width="10" height="8" rx="2" stroke="currentColor" stroke-width="2" fill="none"></rect>
        <circle cx="10" cy="11" r="1.2" fill="currentColor"></circle>
        <circle cx="14" cy="11" r="1.2" fill="currentColor"></circle>
        <path d="M12 3V7" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
        <path d="M9 18H15" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
        <path d="M8 21L9.5 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
        <path d="M16 21L14.5 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
      </svg>
    `;
  }

  _renderTimerRows() {
    const timers = this.timerState?.timers || [];
    return timers
      .map(
        (timer) => `
        <div class="timer-row" data-timer-id="${timer.id}">
          <div class="timer-row-head">
            <span class="timer-label">Timer ${timer.id}</span>
            <span class="timer-summary" id="timer_summary_${timer.id}"></span>
          </div>

          <div class="timer-grid">
            <label class="field">
              <span>Ora</span>
              <select class="timer-input" id="timer_${timer.id}_hour">
                ${this._buildNumberOptions(0, 23, 1, timer.hour)}
              </select>
            </label>

            <label class="field">
              <span>Minuti</span>
              <select class="timer-input" id="timer_${timer.id}_minute">
                ${this._buildNumberOptions(0, 59, 1, timer.minute)}
              </select>
            </label>

            <label class="field">
              <span>Stato</span>
              <select class="timer-input" id="timer_${timer.id}_enabled">
                <option value="1" ${Number(timer.enabled) === 1 ? "selected" : ""}>Attivo</option>
                <option value="0" ${Number(timer.enabled) === 0 ? "selected" : ""}>Off</option>
              </select>
            </label>

            <label class="field field-wide">
              <span>Azione</span>
              <select class="timer-input" id="timer_${timer.id}_action">
                ${this._buildActionOptions(timer.action)}
              </select>
            </label>
          </div>
        </div>
      `
      )
      .join("");
  }

  _bindTimerEvents(root) {
    const timerBtn = root.getElementById("timer_btn");
    const timerCloseBtn = root.getElementById("timer_close_btn");
    const timerOverlay = root.getElementById("timer_overlay");
    const timerSaveBtn = root.getElementById("save_timers_btn");

    if (timerBtn) {
      timerBtn.addEventListener("click", () => {
        this.joystickPanelOpen = false;
        this.timerPanelOpen = true;
        this._syncTimersFromEntitiesOrStorage();
        this._refreshTimerUI();
        this._updatePanels();
      });
    }

    if (timerCloseBtn) {
      timerCloseBtn.addEventListener("click", () => {
        this.timerPanelOpen = false;
        this._updatePanels();
      });
    }

    if (timerOverlay) {
      timerOverlay.addEventListener("click", () => {
        this.timerPanelOpen = false;
        this._updatePanels();
      });
    }

    if (timerSaveBtn) {
      timerSaveBtn.addEventListener("click", () => {
        this._readTimerValuesFromUI();
        this._saveTimerState();
        this._publishTimerPayload();

        if (this.statusEls?.timerSaveMsg) {
          this.statusEls.timerSaveMsg.textContent = "Timer inviati al robot";
          clearTimeout(this._timerSaveMsgTimeout);
          this._timerSaveMsgTimeout = setTimeout(() => {
            if (this.statusEls?.timerSaveMsg) {
              this.statusEls.timerSaveMsg.textContent = "";
            }
          }, 2500);
        }

        this.timerPanelOpen = false;
        this._updatePanels();
      });
    }

    (this.timerState?.timers || []).forEach((timer) => {
      ["hour", "minute", "enabled", "action"].forEach((field) => {
        const el = root.getElementById(`timer_${timer.id}_${field}`);
        if (!el) return;
        el.addEventListener("change", () => {
          this._readTimerValuesFromUI();
          this._refreshTimerUI();
          this._saveTimerState();
        });
      });
    });
  }

  _bindJoystickPanelEvents(root) {
    const closeBtn = root.getElementById("joystick_close_btn");
    const overlay = root.getElementById("joystick_overlay");

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        this.joystickPanelOpen = false;
        this._updatePanels();
        this._reset();
      });
    }

    if (overlay) {
      overlay.addEventListener("click", () => {
        this.joystickPanelOpen = false;
        this._updatePanels();
        this._reset();
      });
    }
  }

  _readTimerValuesFromUI() {
    if (!this.shadowRoot || !this.timerState?.timers) return;

    this.timerState.timers = this.timerState.timers.map((timer) => {
      const hourEl = this.shadowRoot.getElementById(`timer_${timer.id}_hour`);
      const minuteEl = this.shadowRoot.getElementById(`timer_${timer.id}_minute`);
      const enabledEl = this.shadowRoot.getElementById(`timer_${timer.id}_enabled`);
      const actionEl = this.shadowRoot.getElementById(`timer_${timer.id}_action`);

      return {
        ...timer,
        hour: hourEl ? this._clampInt(hourEl.value, 0, 23, timer.hour) : timer.hour,
        minute: minuteEl ? this._clampInt(minuteEl.value, 0, 59, timer.minute) : timer.minute,
        enabled: enabledEl ? this._clampInt(enabledEl.value, 0, 1, timer.enabled) : timer.enabled,
        action: actionEl ? this._clampInt(actionEl.value, 1, 5, timer.action) : timer.action,
      };
    });
  }

  _refreshTimerUI() {
    if (!this.shadowRoot || !this.timerState?.timers) return;

    this.timerState.timers.forEach((timer) => {
      const hourEl = this.shadowRoot.getElementById(`timer_${timer.id}_hour`);
      const minuteEl = this.shadowRoot.getElementById(`timer_${timer.id}_minute`);
      const enabledEl = this.shadowRoot.getElementById(`timer_${timer.id}_enabled`);
      const actionEl = this.shadowRoot.getElementById(`timer_${timer.id}_action`);
      const summaryEl = this.shadowRoot.getElementById(`timer_summary_${timer.id}`);

      if (hourEl) hourEl.value = String(timer.hour);
      if (minuteEl) minuteEl.value = String(timer.minute);
      if (enabledEl) enabledEl.value = String(timer.enabled);
      if (actionEl) actionEl.value = String(timer.action);

      if (summaryEl) {
        summaryEl.textContent = `${String(timer.hour).padStart(2, "0")}:${String(
          timer.minute
        ).padStart(2, "0")} • ${timer.enabled ? "Attivo" : "Off"} • ${this._actionLabel(
          timer.action
        )}`;
      }
    });
  }

  _updatePanels() {
    if (!this.shadowRoot) return;

    const timerPanel = this.shadowRoot.getElementById("timer_panel");
    const timerOverlay = this.shadowRoot.getElementById("timer_overlay");
    const joystickPanel = this.shadowRoot.getElementById("joystick_panel");
    const joystickOverlay = this.shadowRoot.getElementById("joystick_overlay");

    if (timerPanel) timerPanel.classList.toggle("open", this.timerPanelOpen);
    if (timerOverlay) timerOverlay.classList.toggle("open", this.timerPanelOpen);

    if (joystickPanel) joystickPanel.classList.toggle("open", this.joystickPanelOpen);
    if (joystickOverlay) joystickOverlay.classList.toggle("open", this.joystickPanelOpen);
  }

  _openJoystickPanel() {
    this.timerPanelOpen = false;
    this.joystickPanelOpen = true;
    this._updatePanels();
  }

  _renderCard() {
    this._ensureRuntimeState();
    const root = this.attachShadow({ mode: "open" });

    root.innerHTML = `
      <style>
        :host {
          display: block;
        }

        * {
          box-sizing: border-box;
        }

        ha-card {
          position: relative;
          overflow: hidden;
          border-radius: 22px;
          padding: 14px;
          background:
            radial-gradient(circle at top left, rgba(80,120,255,0.14), transparent 34%),
            linear-gradient(180deg, rgba(18,22,30,0.96), rgba(10,12,17,0.98));
          color: #fff;
        }

        .wrap {
          display: grid;
          gap: 12px;
        }

        .title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 20px;
          font-weight: 700;
        }

        .title .dot {
          width: 11px;
          height: 11px;
          border-radius: 999px;
          background: #63ff88;
          box-shadow: 0 0 12px rgba(99,255,136,0.9);
          flex: 0 0 auto;
        }

        .top-actions {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .panel-btn {
          border: 0;
          outline: none;
          border-radius: 16px;
          padding: 12px 14px;
          font-size: 14px;
          font-weight: 800;
          color: #fff;
          cursor: pointer;
          background: linear-gradient(180deg, rgba(59,117,255,0.96), rgba(42,92,220,0.96));
          border: 1px solid rgba(255,255,255,0.1);
          transition: transform 0.16s ease;
        }

        .panel-btn:active {
          transform: scale(0.985);
        }

        .main-view {
          display: grid;
          gap: 12px;
        }

        .hero-card {
          position: relative;
          min-height: 220px;
          border-radius: 22px;
          overflow: hidden;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          padding: 12px;
        }

        .hero-stage {
          position: relative;
          width: 100%;
          height: 150px;
          border-radius: 18px;
          overflow: hidden;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
          border: 1px solid rgba(255,255,255,0.07);
        }

        .grass-layer,
        .grass-cut {
          position: absolute;
          left: 16px;
          right: 16px;
          height: 26px;
          bottom: 18px;
          border-radius: 999px;
        }

        .grass-layer {
          background-image:
            repeating-linear-gradient(
              90deg,
              rgba(120,255,140,0.72) 0px,
              rgba(120,255,140,0.72) 2px,
              transparent 2px,
              transparent 10px
            );
          opacity: 0.72;
        }

        .grass-cut {
          width: 0%;
          overflow: hidden;
          background-image:
            radial-gradient(circle, rgba(230,255,236,0.95) 0 1.3px, transparent 1.5px);
          background-size: 10px 10px;
          opacity: 0.95;
        }

        .robot-img {
          position: absolute;
          left: 50%;
          bottom: 30px;
          transform: translateX(-50%);
          width: 170px;
          max-width: 72%;
          filter: drop-shadow(0 10px 20px rgba(0,0,0,0.38));
          user-select: none;
          pointer-events: none;
        }

        .hero-bottom {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }

        .mini-tile {
          border-radius: 16px;
          padding: 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .mini-label {
          font-size: 12px;
          opacity: 0.75;
          margin-bottom: 6px;
        }

        .mini-value {
          font-size: 22px;
          font-weight: 800;
          line-height: 1;
        }

        .mode-panel {
          border-radius: 18px;
          padding: 12px;
          background: rgba(80,130,255,0.12);
          border: 1px solid rgba(80,130,255,0.22);
        }

        .mode-panel.off {
          background: rgba(255,255,255,0.05);
          border-color: rgba(255,255,255,0.08);
        }

        .mode-title {
          font-size: 17px;
          font-weight: 800;
          margin-bottom: 4px;
        }

        .mode-sub {
          font-size: 13px;
          opacity: 0.85;
        }

        .battery-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .battery-shell {
          position: relative;
          width: 50px;
          height: 22px;
          border: 2px solid rgba(255,255,255,0.92);
          border-radius: 6px;
          padding: 2px;
          display: flex;
          align-items: center;
          background: rgba(255,255,255,0.04);
        }

        .battery-tip {
          position: absolute;
          right: -6px;
          top: 50%;
          width: 4px;
          height: 10px;
          transform: translateY(-50%);
          border-radius: 0 3px 3px 0;
          background: rgba(255,255,255,0.9);
        }

        .battery-bars {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 2px;
          width: 100%;
          height: 100%;
        }

        .battery-bar {
          border-radius: 2px;
          background: rgba(255,255,255,0.14);
        }

        .battery-bar.on {
          background: linear-gradient(180deg, #7dff9d, #2adf68);
        }

        .battery-shell.mid .battery-bar.on {
          background: linear-gradient(180deg, #ffe66d, #ffbb33);
        }

        .battery-shell.low .battery-bar.on {
          background: linear-gradient(180deg, #ff8d8d, #ff4f4f);
        }

        .commands {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }

        .cmd-btn {
          border: 0;
          outline: none;
          border-radius: 18px;
          padding: 12px 8px;
          color: #fff;
          cursor: pointer;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.08);
          transition: transform 0.16s ease, background 0.16s ease;
          display: grid;
          gap: 6px;
          align-items: center;
          justify-items: center;
          min-height: 74px;
        }

        .cmd-btn:active {
          transform: scale(0.98);
        }

        .cmd-btn.primary {
          background: linear-gradient(180deg, rgba(63,132,255,0.95), rgba(42,95,220,0.95));
        }

        .cmd-btn.warn {
          background: linear-gradient(180deg, rgba(255,109,109,0.95), rgba(209,62,62,0.95));
        }

        .cmd-btn.accent {
          background: linear-gradient(180deg, rgba(46,204,113,0.95), rgba(24,155,82,0.95));
        }

        .btn-icon {
          width: 24px;
          height: 24px;
          display: block;
          color: currentColor;
        }

        .cmd-btn .label {
          font-size: 13px;
          font-weight: 800;
          line-height: 1.1;
          text-align: center;
        }

        .bottom-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.35);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.25s ease;
          z-index: 30;
        }

        .overlay.open {
          opacity: 1;
          pointer-events: auto;
        }

        .slide-panel {
          position: absolute;
          left: 10px;
          right: 10px;
          bottom: 10px;
          z-index: 31;
          transform: translateY(108%);
          transition: transform 0.28s ease;
          border-radius: 24px;
          padding: 14px;
          background:
            linear-gradient(180deg, rgba(18,22,30,0.985), rgba(10,12,17,0.985));
          border: 1px solid rgba(255,255,255,0.09);
          box-shadow: 0 18px 40px rgba(0,0,0,0.45);
          max-height: calc(100% - 20px);
          overflow: auto;
        }

        .slide-panel.open {
          transform: translateY(0);
        }

        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 12px;
        }

        .panel-title {
          font-size: 18px;
          font-weight: 800;
        }

        .panel-close {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          border: 0;
          cursor: pointer;
          color: #fff;
          background: rgba(255,255,255,0.08);
          font-size: 18px;
          font-weight: 800;
        }

        .panel-note {
          font-size: 12px;
          opacity: 0.76;
          margin-bottom: 12px;
        }

        .joystick-stage {
          display: grid;
          gap: 12px;
        }

        .pad-card {
          border-radius: 22px;
          padding: 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .pad {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 24px;
          overflow: hidden;
          background:
            radial-gradient(circle at center, rgba(255,255,255,0.08), rgba(255,255,255,0.02) 48%, transparent 49%),
            linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
          border: 1px solid rgba(255,255,255,0.08);
          touch-action: none;
        }

        .pad::before,
        .pad::after {
          content: "";
          position: absolute;
          background: rgba(255,255,255,0.08);
        }

        .pad::before {
          left: 50%;
          top: 10px;
          bottom: 10px;
          width: 1px;
          transform: translateX(-50%);
        }

        .pad::after {
          top: 50%;
          left: 10px;
          right: 10px;
          height: 1px;
          transform: translateY(-50%);
        }

        .knob {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          background:
            radial-gradient(circle at 35% 30%, rgba(255,255,255,0.95), rgba(255,255,255,0.18) 35%, rgba(68,130,255,0.85));
          box-shadow:
            0 8px 18px rgba(0,0,0,0.3),
            0 0 0 1px rgba(255,255,255,0.25) inset;
          z-index: 2;
          pointer-events: none;
        }

        .joy-values {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .joy-box {
          border-radius: 16px;
          padding: 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .joy-box .k {
          font-size: 12px;
          opacity: 0.74;
          margin-bottom: 6px;
        }

        .joy-box .v {
          font-size: 18px;
          font-weight: 800;
        }

        .timer-list {
          display: grid;
          gap: 10px;
        }

        .timer-row {
          border-radius: 18px;
          padding: 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .timer-row-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 10px;
        }

        .timer-label {
          font-weight: 800;
          font-size: 15px;
        }

        .timer-summary {
          font-size: 12px;
          opacity: 0.78;
          text-align: right;
        }

        .timer-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }

        .field {
          display: grid;
          gap: 6px;
        }

        .field-wide {
          grid-column: 1 / -1;
        }

        .field span {
          font-size: 12px;
          opacity: 0.8;
        }

        .timer-input {
          width: 100%;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.08);
          color: #fff;
          padding: 10px 12px;
          outline: none;
          font-size: 14px;
          font-weight: 700;
        }

        .timer-input option {
          color: #111;
        }

        .timer-footer {
          margin-top: 14px;
          display: grid;
          gap: 8px;
        }

        .timer-save-msg {
          min-height: 18px;
          font-size: 12px;
          color: #9cffb2;
          text-align: center;
        }

        @media (max-width: 760px) {
          .hero-bottom {
            grid-template-columns: 1fr;
          }

          .commands {
            grid-template-columns: repeat(3, 1fr);
          }

          .timer-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
      </style>

      <ha-card>
        <div class="wrap">
          <div class="title">
            <span>${this.config.title}</span>
            <span class="dot"></span>
          </div>

          <div class="top-actions">
            <button class="panel-btn" id="joystick_btn_top">Joystick</button>
          </div>

          <div class="main-view">
            <div class="hero-card">
              <div class="hero-stage">
                <div class="grass-layer"></div>
                <div class="grass-cut" id="grass_cut"></div>
                <img class="robot-img" src="${this.config.robot_image}" alt="Robot">
              </div>

              <div class="hero-bottom">
                <div class="mini-tile">
                  <div class="mini-label">Battery</div>
                  <div class="battery-row">
                    <div class="mini-value" id="battery_pct">0%</div>
                    <div id="battery_icon">${this._renderBatteryIcon(0)}</div>
                  </div>
                </div>

                <div class="mini-tile">
                  <div class="mini-label">Loop</div>
                  <div class="mini-value" id="loop_val">-</div>
                </div>

                <div class="mini-tile">
                  <div class="mini-label">Amp</div>
                  <div class="mini-value" id="battery_amps_val">-</div>
                </div>
              </div>
            </div>

            <div class="mode-panel" id="mow_panel">
              <div class="mode-title" id="mow_text">Idle</div>
              <div class="mode-sub" id="mow_sub">In attesa</div>
            </div>

            <div class="commands">
              <button class="cmd-btn primary" data-command="start">
                ${this._iconStart()}
                <span class="label">Start</span>
              </button>

              <button class="cmd-btn warn" data-command="stop">
                ${this._iconStop()}
                <span class="label">Stop</span>
              </button>

              <button class="cmd-btn accent" data-command="exit_dock">
                ${this._iconExitDock()}
                <span class="label">Exit Dock</span>
              </button>

              <button class="cmd-btn" data-command="dock">
                ${this._iconDock()}
                <span class="label">Dock</span>
              </button>

              <button class="cmd-btn" data-command="manual_mode">
                ${this._iconManual()}
                <span class="label">Manual</span>
              </button>

              <button class="cmd-btn" data-command="auto_mode">
                ${this._iconAuto()}
                <span class="label">Auto</span>
              </button>
            </div>

            <div class="bottom-actions">
              <button class="panel-btn" id="timer_btn">Timer</button>
              <button class="panel-btn" id="joystick_btn_bottom">Joystick</button>
            </div>
          </div>
        </div>

        <div class="overlay" id="joystick_overlay"></div>
        <div class="overlay" id="timer_overlay"></div>

        <div class="slide-panel" id="joystick_panel">
          <div class="panel-header">
            <div class="panel-title">Joystick</div>
            <button class="panel-close" id="joystick_close_btn">✕</button>
          </div>

          <div class="panel-note">
            Muovi il joystick per comandare il robot e premi X per tornare alla card principale.
          </div>

          <div class="joystick-stage">
            <div class="pad-card">
              <div class="pad" id="pad">
                <div class="knob" id="knob"></div>
              </div>
            </div>

            <div class="joy-values">
              <div class="joy-box">
                <div class="k">Joystick</div>
                <div class="v">X: <span id="xv">0</span> | Y: <span id="yv">0</span></div>
              </div>

              <div class="joy-box">
                <div class="k">Motori</div>
                <div class="v">L: <span id="lv">0</span> | R: <span id="rv">0</span></div>
              </div>
            </div>
          </div>
        </div>

        <div class="slide-panel" id="timer_panel">
          <div class="panel-header">
            <div class="panel-title">Programmazione Timer</div>
            <button class="panel-close" id="timer_close_btn">✕</button>
          </div>

          <div class="panel-note">
            Modifica gli orari e le azioni, poi premi conferma per salvarli sul robot.
          </div>

          <div class="timer-list">
            ${this._renderTimerRows()}
          </div>

          <div class="timer-footer">
            <button class="panel-btn" id="save_timers_btn">Conferma e salva</button>
            <div class="timer-save-msg" id="timer_save_msg"></div>
          </div>
        </div>
      </ha-card>
    `;

    this.content = root.querySelector("ha-card");
    this.pad = root.getElementById("pad");
    this.knob = root.getElementById("knob");

    this.xv = root.getElementById("xv");
    this.yv = root.getElementById("yv");
    this.lv = root.getElementById("lv");
    this.rv = root.getElementById("rv");

    this.statusEls = {
      batteryPct: root.getElementById("battery_pct"),
      batteryIcon: root.getElementById("battery_icon"),
      batteryAmps: root.getElementById("battery_amps_val"),
      loop: root.getElementById("loop_val"),
      mowPanel: root.getElementById("mow_panel"),
      mowText: root.getElementById("mow_text"),
      mowSub: root.getElementById("mow_sub"),
      grassCut: root.getElementById("grass_cut"),
      timerSaveMsg: root.getElementById("timer_save_msg"),
    };

    root.querySelectorAll(".cmd-btn[data-command]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._sendCommand(btn.dataset.command);
      });
    });

    const joyTop = root.getElementById("joystick_btn_top");
    const joyBottom = root.getElementById("joystick_btn_bottom");

    if (joyTop) {
      joyTop.addEventListener("click", () => this._openJoystickPanel());
    }
    if (joyBottom) {
      joyBottom.addEventListener("click", () => this._openJoystickPanel());
    }

    this._bindJoystickPanelEvents(root);
    this._bindTimerEvents(root);
    this._refreshTimerUI();
    this._updatePanels();

    this.isDragging = false;

    this.pad.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.isDragging = true;
      this.pad.setPointerCapture(ev.pointerId);
      this._move(ev.clientX, ev.clientY, true);
    });

    this.pad.addEventListener("pointermove", (ev) => {
      if (!this.isDragging) return;
      ev.preventDefault();
      ev.stopPropagation();
      this._move(ev.clientX, ev.clientY, false);
    });

    const stopDrag = (ev) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      try {
        this.pad.releasePointerCapture(ev.pointerId);
      } catch (_error) {
        // ignore
      }
      this._reset();
    };

    this.pad.addEventListener("pointerup", stopDrag);
    this.pad.addEventListener("pointercancel", stopDrag);
    this.pad.addEventListener("lostpointercapture", () => {
      if (this.isDragging) {
        this.isDragging = false;
        this._reset();
      }
    });
  }

  _updateStates() {
    if (!this._hass || !this.statusEls) return;

    const batteryVoltage = this._getNumericState(this.config.battery_entity);
    const batteryPct = this._getBatteryPercentage(batteryVoltage);
    const batteryAmps = this._getState(this.config.battery_amps_entity);
    const loop = this._getState(this.config.loop_entity);
    const mode = this._getRobotMode();

    this.statusEls.batteryPct.textContent = `${batteryPct}%`;
    this.statusEls.batteryIcon.innerHTML = this._renderBatteryIcon(batteryPct);
    this.statusEls.batteryAmps.textContent = batteryAmps;
    this.statusEls.loop.textContent = loop;
    this.statusEls.mowText.textContent = mode.label;
    this.statusEls.mowSub.textContent = mode.sublabel;
    this.statusEls.mowPanel.classList.toggle("off", mode.panelOff);

    if (mode.animate) {
      this._startGrassAnimation();
    } else {
      this._stopGrassAnimation(true);
    }
  }

  _move(clientX, clientY, force = false) {
    const rect = this.pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const max = this.config.max_distance;

    if (dist > max) {
      dx = (dx / dist) * max;
      dy = (dy / dist) * max;
    }

    let x = dx / max;
    let y = -(dy / max);

    if (Math.abs(x) < this.config.deadzone) x = 0;
    if (Math.abs(y) < this.config.deadzone) y = 0;

    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));

    let left = y + x;
    let right = y - x;

    left = Math.max(-1, Math.min(1, left));
    right = Math.max(-1, Math.min(1, right));

    this.state = {
      x: Math.round(x * 100),
      y: Math.round(y * 100),
      left: Math.round(left * 100),
      right: Math.round(right * 100),
      active: 1,
    };

    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this._refreshTelemetry();

    const now = Date.now();
    if (force || now - this.lastPublish >= this.config.publish_interval) {
      this.lastPublish = now;
      this._publishJoystick();
    }
  }

  _reset() {
    this.state = { x: 0, y: 0, left: 0, right: 0, active: 0 };
    if (this.knob) {
      this.knob.style.transform = "translate(-50%, -50%)";
    }
    this._refreshTelemetry();
    this._publishJoystick();
  }

  _refreshTelemetry() {
    if (this.xv) this.xv.textContent = this.state.x;
    if (this.yv) this.yv.textContent = this.state.y;
    if (this.lv) this.lv.textContent = this.state.left;
    if (this.rv) this.rv.textContent = this.state.right;
  }

  _publishJoystick() {
    if (!this._hass) return;

    this._hass.callService("mqtt", "publish", {
      topic: this.config.topic,
      payload: JSON.stringify(this.state),
      qos: 0,
      retain: false,
    });
  }
}

if (!customElements.get("robot-joystick-card")) {
  customElements.define("robot-joystick-card", RobotJoystickCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "robot-joystick-card",
  name: "Robot Joystick Card",
  description: "Controllo joystick MQTT per robot tagliaerba Arduino",
  preview: true,
});

console.info(
  "%c ROBOT-JOYSTICK-CARD %c 1.0.6 ",
  "color: white; background: #2f6bff; font-weight: 700;",
  "color: white; background: #111; font-weight: 700;"
);
