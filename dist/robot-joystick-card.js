const DEFAULT_ROBOT_IMAGE = '/hacsfiles/Robot-joystick-card/Robot.jpg';

class RobotJoystickCard extends HTMLElement {
  static getStubConfig() {
    return {
      type: 'custom:robot-joystick-card',
      title: 'Robot Tagliaerba',
    };
  }

  setConfig(config) {
    if (!config) {
      throw new Error('Configurazione non valida');
    }

    this.config = {
      title: 'Robot Tagliaerba',
      topic: 'home/robot/mower/control/joystick',
      command_topic: 'home/robot/mower/control',
      max_distance: 110,
      deadzone: 0.06,
      publish_interval: 40,

      battery_entity: 'sensor.mower_battery',
      battery_amps_entity: 'sensor.robotmowerbatteryamps',
      charge_entity: 'sensor.mower_charge',
      loop_entity: 'sensor.mower_loop',
      running_entity: 'sensor.mower_running',
      parked_entity: 'sensor.mower_parked',
      docked_entity: 'sensor.mower_docked',
      tracking_entity: 'sensor.mower_tracking',

      robot_image: DEFAULT_ROBOT_IMAGE,

      batt_min_voltage: 28.0,
      batt_max_voltage: 33.6,

      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.content) {
      this._renderCard();
    }
    this._updateStates();
  }

  getCardSize() {
    return 10;
  }

  disconnectedCallback() {
    this._stopGrassAnimation(true);
  }

  _getState(entityId) {
    return this._hass?.states?.[entityId]?.state ?? '-';
  }

  _getNumericState(entityId, fallback = NaN) {
    const value = parseFloat(this._getState(entityId));
    return Number.isNaN(value) ? fallback : value;
  }

  _normalizeState(val) {
    return String(val ?? '').trim().toLowerCase();
  }

  _isTruthyState(val) {
    const state = this._normalizeState(val);
    return [
      '1',
      'on',
      'true',
      'yes',
      'si',
      'sì',
      'in carica',
      'in base',
      'parcheggiato',
      'falciatura',
      'tracciatura filo',
      'tracking',
      'attivo',
      'active',
      'online',
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
    const cls = percentage <= 15 ? 'low' : percentage <= 35 ? 'mid' : '';

    return `
      <div class="battery-icon ${cls}">
        <div class="battery-shell">
          <div class="battery-bars">
            <div class="battery-bar ${bars >= 1 ? 'active' : ''}"></div>
            <div class="battery-bar ${bars >= 2 ? 'active' : ''}"></div>
            <div class="battery-bar ${bars >= 3 ? 'active' : ''}"></div>
            <div class="battery-bar ${bars >= 4 ? 'active' : ''}"></div>
            <div class="battery-bar ${bars >= 5 ? 'active' : ''}"></div>
          </div>
        </div>
        <div class="battery-tip"></div>
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
      this._normalizeState(chargeState) === 'in carica' ||
      this._normalizeState(dockedState) === 'in base' ||
      this._isTruthyState(chargeState) ||
      this._isTruthyState(dockedState);

    const parked =
      this._normalizeState(parkedState) === 'parcheggiato' ||
      this._isTruthyState(parkedState);

    const mowing =
      this._normalizeState(runningState) === 'falciatura' ||
      this._isTruthyState(runningState);

    const tracking =
      this._normalizeState(trackingState) === 'tracciatura filo' ||
      this._isTruthyState(trackingState);

    if (charging) {
      return {
        code: 'charging',
        label: 'In carica',
        sublabel: 'Robot in base',
        animate: false,
        panelOff: true,
      };
    }

    if (parked) {
      return {
        code: 'parked',
        label: 'Parcheggiato',
        sublabel: 'Robot fermo',
        animate: false,
        panelOff: true,
      };
    }

    if (mowing) {
      return {
        code: 'mowing',
        label: 'Falciatura',
        sublabel: 'Robot in lavoro',
        animate: true,
        panelOff: false,
      };
    }

    if (tracking) {
      return {
        code: 'tracking',
        label: 'Tracking',
        sublabel: 'Tracciatura filo',
        animate: false,
        panelOff: true,
      };
    }

    return {
      code: 'idle',
      label: 'Idle',
      sublabel: 'In attesa',
      animate: false,
      panelOff: true,
    };
  }

  _sendCommand(command) {
    if (!this._hass) return;

    this._hass.callService('mqtt', 'publish', {
      topic: this.config.command_topic,
      payload: command,
      qos: 0,
      retain: false,
    });
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
      this.statusEls.grassCut.style.width = '0%';
    }
  }

  _renderCard() {
    this.state = {
      x: 0,
      y: 0,
      left: 0,
      right: 0,
      active: 0,
    };

    this.lastPublish = 0;

    const root = this.attachShadow({ mode: 'open' });

    root.innerHTML = `
      <style>
        ha-card {
          padding: 14px;
          box-sizing: border-box;
          user-select: none;
          -webkit-user-select: none;
          overflow: hidden;
          border-radius: 22px;
        }

        .title {
          text-align: center;
          font-size: 22px;
          font-weight: 800;
          margin-bottom: 12px;
        }

        .section {
          margin-bottom: 16px;
        }

        .top-wrap {
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .pad {
          position: relative;
          width: 260px;
          height: 260px;
          border-radius: 50%;
          background:
            radial-gradient(circle at center, rgba(255,255,255,0.04) 0 24%, transparent 25%),
            radial-gradient(circle at center, rgba(255,255,255,0.03) 0 62%, rgba(255,255,255,0.07) 63%, transparent 64%),
            rgba(255,255,255,0.02);
          overflow: hidden;
          touch-action: none;
          border: 1px solid rgba(255,255,255,0.06);
          box-shadow: inset 0 0 40px rgba(255,255,255,0.03);
        }

        .cross-h,
        .cross-v {
          position: absolute;
          background: rgba(255,255,255,0.06);
        }

        .cross-h {
          left: 14%;
          right: 14%;
          top: 50%;
          height: 1px;
          transform: translateY(-50%);
        }

        .cross-v {
          top: 14%;
          bottom: 14%;
          left: 50%;
          width: 1px;
          transform: translateX(-50%);
        }

        .arrow {
          position: absolute;
          width: 0;
          height: 0;
          opacity: 0.85;
        }

        .arrow.up {
          left: 50%;
          top: 18px;
          transform: translateX(-50%);
          border-left: 10px solid transparent;
          border-right: 10px solid transparent;
          border-bottom: 18px solid #a7a7c7;
        }

        .arrow.down {
          left: 50%;
          bottom: 18px;
          transform: translateX(-50%);
          border-left: 10px solid transparent;
          border-right: 10px solid transparent;
          border-top: 18px solid #a7a7c7;
        }

        .arrow.left {
          top: 50%;
          left: 18px;
          transform: translateY(-50%);
          border-top: 10px solid transparent;
          border-bottom: 10px solid transparent;
          border-right: 18px solid #a7a7c7;
        }

        .arrow.right {
          top: 50%;
          right: 18px;
          transform: translateY(-50%);
          border-top: 10px solid transparent;
          border-bottom: 10px solid transparent;
          border-left: 18px solid #a7a7c7;
        }

        .knob {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 70px;
          height: 70px;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          background: #a8acc6;
          box-shadow:
            0 0 0 12px rgba(255,255,255,0.03),
            0 6px 20px rgba(0,0,0,0.35);
        }

        .telemetry {
          text-align: center;
          margin-top: 12px;
          line-height: 1.7;
          font-size: 14px;
          color: var(--secondary-text-color);
        }

        .hero {
          position: relative;
          min-height: 405px;
          border-radius: 24px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.08);
          background:
            radial-gradient(circle at 50% 35%, rgba(255,200,80,0.08), transparent 35%),
            linear-gradient(180deg, rgba(18,20,24,1) 0%, rgba(14,16,18,1) 100%);
        }

        .hero-bg {
          position: absolute;
          inset: 0;
          background-image: url('${this.config.robot_image}');
          background-size: cover;
          background-repeat: no-repeat;
          background-position: center center;
          filter: saturate(0.95) contrast(1.02);
        }

        .hero-fade {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0.04) 30%, rgba(0,0,0,0.20) 100%);
          pointer-events: none;
        }

        .info-chip {
          position: absolute;
          min-width: 92px;
          max-width: 120px;
          padding: 7px 9px;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          background: rgba(20,20,22,0.52);
          backdrop-filter: blur(6px);
          box-shadow: 0 6px 18px rgba(0,0,0,0.18);
          z-index: 2;
        }

        .info-label {
          font-size: 10px;
          color: #aeb4bf;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 3px;
          line-height: 1.1;
        }

        .info-value {
          font-size: 13px;
          font-weight: 800;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 6px;
          line-height: 1.2;
          word-break: break-word;
        }

        .chip-battery { top: 12px; left: 12px; }
        .chip-loop    { left: 12px; bottom: 78px; }
        .chip-amps    { right: 12px; bottom: 78px; min-width: 120px; max-width: 132px; text-align: center; }

        .battery-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          width: 100%;
        }

        .battery-icon {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }

        .battery-shell {
          width: 46px;
          height: 21px;
          border: 2px solid #a1a1a1;
          border-radius: 6px;
          background: #e2e2e2;
          padding: 2px;
          box-sizing: border-box;
        }

        .battery-bars {
          width: 100%;
          height: 100%;
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 2px;
        }

        .battery-bar {
          border-radius: 2px;
          background: #bbbbbb;
        }

        .battery-bar.active {
          background: #24c95b;
        }

        .battery-icon.mid .battery-bar.active {
          background: #e8b21f;
        }

        .battery-icon.low .battery-bar.active {
          background: #ff4d4d;
        }

        .battery-tip {
          width: 4px;
          height: 10px;
          background: #a1a1a1;
          border-radius: 0 3px 3px 0;
          margin-left: 2px;
        }

        .mow-panel {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: 12px;
          height: 58px;
          border-radius: 18px;
          background: linear-gradient(90deg, #f18f00 0%, #ff9800 100%);
          color: #fff;
          box-shadow: 0 10px 25px rgba(255,140,0,0.28);
          overflow: hidden;
          z-index: 2;
        }

        .mow-panel.off {
          background: linear-gradient(90deg, #444b57 0%, #59606d 100%);
          box-shadow: none;
        }

        .mow-text {
          position: absolute;
          left: 14px;
          top: 8px;
          font-size: 16px;
          font-weight: 800;
          z-index: 3;
          line-height: 1.1;
        }

        .mow-sub {
          position: absolute;
          left: 14px;
          bottom: 8px;
          font-size: 11px;
          opacity: 0.95;
          z-index: 3;
          line-height: 1.1;
        }

        .grass-track {
          position: absolute;
          left: 132px;
          right: 8px;
          top: 8px;
          bottom: 8px;
          border-radius: 14px;
          overflow: hidden;
          z-index: 1;
          background: rgba(255,255,255,0.03);
        }

        .grass-tall {
          position: absolute;
          inset: 0;
          background:
            repeating-linear-gradient(
              90deg,
              transparent 0px,
              transparent 4px,
              rgba(255,255,255,0.35) 4px,
              rgba(255,255,255,0.35) 6px,
              transparent 6px,
              transparent 10px
            );
          mask-image: linear-gradient(
            to top,
            transparent 0%,
            rgba(0,0,0,1) 18%,
            rgba(0,0,0,1) 100%
          );
          -webkit-mask-image: linear-gradient(
            to top,
            transparent 0%,
            rgba(0,0,0,1) 18%,
            rgba(0,0,0,1) 100%
          );
          opacity: 0.95;
        }

        .grass-cut {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 0%;
          overflow: hidden;
          background:
            radial-gradient(circle, rgba(255,255,255,0.28) 0 1.2px, transparent 1.3px);
          background-size: 8px 8px;
          background-position: 0 78%;
          mask-image: linear-gradient(
            to top,
            transparent 0%,
            rgba(0,0,0,1) 10%,
            rgba(0,0,0,1) 24%,
            transparent 25%
          );
          -webkit-mask-image: linear-gradient(
            to top,
            transparent 0%,
            rgba(0,0,0,1) 10%,
            rgba(0,0,0,1) 24%,
            transparent 25%
          );
          transition: width 0.06s linear;
        }

        .mower-mini {
          position: absolute;
          top: 50%;
          left: -62px;
          transform: translateY(-50%);
          width: 56px;
          height: 30px;
          animation: robotPass 4.8s linear infinite;
          z-index: 2;
        }

        .mow-panel.off .mower-mini {
          animation: none;
          left: 10px;
        }

        .mower-mini .rear-wheel {
          position: absolute;
          left: 0;
          bottom: 0;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #d4a53a;
          border: 2px solid rgba(0,0,0,0.45);
          box-sizing: border-box;
        }

        .mower-mini .rear-wheel::after {
          content: '';
          position: absolute;
          inset: 5px;
          border-radius: 50%;
          border: 1px solid rgba(0,0,0,0.35);
        }

        .mower-mini .wheel-guard {
          position: absolute;
          left: -2px;
          bottom: 11px;
          width: 27px;
          height: 10px;
          border-radius: 14px 14px 0 0;
          border-top: 3px solid #d4a53a;
          border-left: 2px solid #d4a53a;
          border-right: 2px solid #d4a53a;
          background: transparent;
          transform: rotate(-2deg);
        }

        .mower-mini .body {
          position: absolute;
          left: 18px;
          bottom: 6px;
          width: 30px;
          height: 12px;
          background: #d4a53a;
          border-radius: 6px 10px 4px 4px;
        }

        .mower-mini .body-top {
          position: absolute;
          left: 22px;
          bottom: 14px;
          width: 24px;
          height: 9px;
          background: #d4a53a;
          border-radius: 5px 7px 3px 3px;
        }

        .mower-mini .front-arm {
          position: absolute;
          left: 43px;
          bottom: 9px;
          width: 10px;
          height: 6px;
          background: #8d8d8d;
          border-radius: 2px;
        }

        .mower-mini .front-wheel {
          position: absolute;
          right: 0;
          bottom: 1px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #d98c2e;
          border: 2px solid rgba(0,0,0,0.45);
          box-sizing: border-box;
        }

        .mower-mini .sensor-head {
          position: absolute;
          left: 30px;
          bottom: 20px;
          width: 11px;
          height: 6px;
          background: #e7e2d8;
          border-radius: 2px 2px 0 0;
          border: 1px solid rgba(0,0,0,0.18);
          box-sizing: border-box;
        }

        .mower-mini .trim-cut {
          position: absolute;
          left: 18px;
          bottom: 2px;
          width: 26px;
          height: 2px;
          background: rgba(255,255,255,0.35);
          border-radius: 2px;
        }

        @keyframes robotPass {
          0%   { left: -62px; }
          100% { left: calc(100% - 4px); }
        }

        .button-grid-4 {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }

        .button-grid-2 {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }

        .cmd-btn {
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 18px;
          background: rgba(255,255,255,0.03);
          min-height: 82px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: transform 0.08s ease, background 0.2s ease;
          font-weight: 700;
          text-align: center;
          padding: 8px;
          box-sizing: border-box;
        }

        .cmd-btn:active {
          transform: scale(0.98);
        }

        .cmd-btn:hover {
          background: rgba(255,255,255,0.06);
        }

        .cmd-btn ha-icon {
          --mdc-icon-size: 34px;
        }

        .green ha-icon { color: #29c34a; }
        .red ha-icon { color: #ff3b30; }
        .blue ha-icon { color: #2f6bff; }
        .purple ha-icon { color: #b000d4; }
        .white ha-icon { color: #f2f2f2; }
        .orange ha-icon { color: #f7a600; }

        @media (max-width: 700px) {
          .hero {
            min-height: 340px;
          }

          .pad {
            width: 220px;
            height: 220px;
          }

          .button-grid-4 {
            grid-template-columns: repeat(2, 1fr);
          }

          .info-chip {
            min-width: 78px;
            max-width: 104px;
            padding: 6px 8px;
            border-radius: 10px;
          }

          .info-label {
            font-size: 9px;
          }

          .info-value {
            font-size: 11px;
            gap: 4px;
          }

          .chip-battery {
            top: 10px;
            left: 8px;
          }

          .chip-loop {
            left: 8px;
            bottom: 72px;
          }

          .chip-amps {
            right: 8px;
            bottom: 72px;
            min-width: 86px;
            max-width: 96px;
          }

          .battery-shell {
            width: 36px;
            height: 18px;
            padding: 2px;
          }

          .battery-tip {
            width: 4px;
            height: 8px;
            margin-left: 2px;
          }

          .mow-panel {
            left: 10px;
            right: 10px;
            bottom: 10px;
            height: 52px;
            border-radius: 14px;
          }

          .mow-text {
            left: 12px;
            top: 7px;
            font-size: 15px;
          }

          .mow-sub {
            left: 12px;
            bottom: 7px;
            font-size: 10px;
          }

          .grass-track {
            left: 112px;
            right: 8px;
            top: 7px;
            bottom: 7px;
          }

          .mower-mini {
            width: 44px;
            height: 24px;
            left: -50px;
          }

          .mower-mini .rear-wheel {
            width: 19px;
            height: 19px;
          }

          .mower-mini .wheel-guard {
            width: 22px;
            bottom: 9px;
          }

          .mower-mini .body {
            left: 14px;
            width: 24px;
            height: 10px;
            bottom: 5px;
          }

          .mower-mini .body-top {
            left: 17px;
            width: 19px;
            height: 7px;
            bottom: 12px;
          }

          .mower-mini .front-arm {
            left: 34px;
            width: 8px;
            height: 5px;
            bottom: 8px;
          }

          .mower-mini .front-wheel {
            width: 10px;
            height: 10px;
          }

          .mower-mini .sensor-head {
            left: 23px;
            width: 9px;
            height: 5px;
            bottom: 17px;
          }

          .mower-mini .trim-cut {
            left: 14px;
            width: 20px;
          }
        }
      </style>

      <ha-card>
        <div class="title">${this.config.title}</div>

        <div class="section top-wrap">
          <div>
            <div class="pad" id="pad">
              <div class="cross-h"></div>
              <div class="cross-v"></div>
              <div class="arrow up"></div>
              <div class="arrow down"></div>
              <div class="arrow left"></div>
              <div class="arrow right"></div>
              <div class="knob" id="knob"></div>
            </div>

            <div class="telemetry">
              <div>X: <span id="xv">0</span> | Y: <span id="yv">0</span></div>
              <div>LEFT: <span id="lv">0</span> | RIGHT: <span id="rv">0</span></div>
            </div>
          </div>
        </div>

        <div class="section hero">
          <div class="hero-bg"></div>
          <div class="hero-fade"></div>

          <div class="info-chip chip-battery">
            <div class="info-label">Battery</div>
            <div class="info-value battery-line">
              <span id="battery_pct">0%</span>
              <span id="battery_icon">${this._renderBatteryIcon(0)}</span>
            </div>
          </div>

          <div class="info-chip chip-loop">
            <div class="info-label">Loop</div>
            <div class="info-value" id="loop_val">-</div>
          </div>

          <div class="info-chip chip-amps">
            <div class="info-label">Bat Amps</div>
            <div class="info-value" id="battery_amps_val">-</div>
          </div>

          <div class="mow-panel off" id="mow_panel">
            <div class="mow-text" id="mow_text">Idle</div>
            <div class="mow-sub" id="mow_sub">In attesa</div>

            <div class="grass-track">
              <div class="grass-tall"></div>
              <div class="grass-cut" id="grass_cut"></div>

              <div class="mower-mini">
                <div class="rear-wheel"></div>
                <div class="wheel-guard"></div>
                <div class="body"></div>
                <div class="body-top"></div>
                <div class="front-arm"></div>
                <div class="front-wheel"></div>
                <div class="sensor-head"></div>
                <div class="trim-cut"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="section button-grid-4">
          <div class="cmd-btn green" data-command="start">
            <ha-icon icon="mdi:play"></ha-icon>
            <div>Start</div>
          </div>
          <div class="cmd-btn red" data-command="pause">
            <ha-icon icon="mdi:stop"></ha-icon>
            <div>Stop</div>
          </div>
          <div class="cmd-btn blue" data-command="Exit Dock">
            <ha-icon icon="mdi:home-export-outline"></ha-icon>
            <div>Exit Dock</div>
          </div>
          <div class="cmd-btn purple" data-command="dock">
            <ha-icon icon="mdi:home"></ha-icon>
            <div>Dock</div>
          </div>
        </div>

        <div class="section button-grid-2">
          <div class="cmd-btn white" data-command="manuale">
            <ha-icon icon="mdi:gamepad"></ha-icon>
            <div>Manual Mode</div>
          </div>
          <div class="cmd-btn orange" data-command="automatico">
            <ha-icon icon="mdi:robot-mower"></ha-icon>
            <div>Automatic Mode</div>
          </div>
        </div>
      </ha-card>
    `;

    this.content = root.querySelector('ha-card');
    this.pad = root.getElementById('pad');
    this.knob = root.getElementById('knob');
    this.xv = root.getElementById('xv');
    this.yv = root.getElementById('yv');
    this.lv = root.getElementById('lv');
    this.rv = root.getElementById('rv');

    this.statusEls = {
      batteryPct: root.getElementById('battery_pct'),
      batteryIcon: root.getElementById('battery_icon'),
      batteryAmps: root.getElementById('battery_amps_val'),
      loop: root.getElementById('loop_val'),
      mowPanel: root.getElementById('mow_panel'),
      mowText: root.getElementById('mow_text'),
      mowSub: root.getElementById('mow_sub'),
      grassCut: root.getElementById('grass_cut'),
    };

    root.querySelectorAll('.cmd-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._sendCommand(btn.dataset.command);
      });
    });

    this.isDragging = false;

    this.pad.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.isDragging = true;
      this.pad.setPointerCapture(ev.pointerId);
      this._move(ev.clientX, ev.clientY, true);
    });

    this.pad.addEventListener('pointermove', (ev) => {
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

    this.pad.addEventListener('pointerup', stopDrag);
    this.pad.addEventListener('pointercancel', stopDrag);
    this.pad.addEventListener('lostpointercapture', () => {
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
    this.statusEls.mowPanel.classList.toggle('off', mode.panelOff);

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
    this.state = {
      x: 0,
      y: 0,
      left: 0,
      right: 0,
      active: 0,
    };

    this.knob.style.transform = 'translate(-50%, -50%)';
    this._refreshTelemetry();
    this._publishJoystick();
  }

  _refreshTelemetry() {
    this.xv.textContent = this.state.x;
    this.yv.textContent = this.state.y;
    this.lv.textContent = this.state.left;
    this.rv.textContent = this.state.right;
  }

  _publishJoystick() {
    if (!this._hass) return;

    this._hass.callService('mqtt', 'publish', {
      topic: this.config.topic,
      payload: JSON.stringify(this.state),
      qos: 0,
      retain: false,
    });
  }
}

if (!customElements.get('robot-joystick-card')) {
  customElements.define('robot-joystick-card', RobotJoystickCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'robot-joystick-card',
  name: 'Robot Joystick Card',
  description: 'Controllo joystick MQTT per robot tagliaerba Arduino',
  preview: true,
});

console.info(
  '%c ROBOT-JOYSTICK-CARD %c 1.0.0 ',
  'color: white; background: #2f6bff; font-weight: 700;',
  'color: white; background: #111; font-weight: 700;'
);
