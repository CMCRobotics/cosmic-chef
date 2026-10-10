/**
 * head-chef-status-display.js
 * Displays real-time sous-chef states, ingredient counts, and recipe phase.
 * Shows as a text-based HUD in world space.
 */

AFRAME.registerComponent('head-chef-status-display', {
    schema: {
        updateInterval: { type: 'number', default: 500 } // ms between display updates
    },

    init: function () {
        this.log = window.log.getLogger('head-chef-status-display');
        this.log.debug('Initializing head-chef-status-display');

        this.statusText = null;
        this.lastState = null;
        this.lastContext = null;
        this.updateHandle = null;

        // Listen for state changes
        const scene = document.querySelector('a-scene');
        scene.addEventListener('game-state-changed', (evt) => {
            this.onStateChange(evt.detail.state, evt.detail.context);
        });

        // Create status text display
        this.createStatusDisplay();

        this.log.debug('Head Chef status display ready');
    },

    createStatusDisplay: function () {
        // Create a text entity for displaying status on the large screen
        const textEl = document.createElement('a-entity');
        textEl.setAttribute('id', 'head-chef-status-text');
        textEl.setAttribute('text', {
            value: 'En attente...',
            align: 'center',
            anchor: 'center',
            baseline: 'center',
            width: 50,
            color: '#00ff00',
            wrapCount: 100,
            fontSize: 120
        });

        // Position centered on the screen (screen is at 0 2.7 -5.2)
        // Offset slightly forward from screen surface
        textEl.setAttribute('position', '0 2.7 0.1');
        textEl.setAttribute('rotation', '0 0 0'); // Face the screen directly
        textEl.setAttribute('scale', '0.4 0.25 0.4'); // 8x larger (0.08 * 8)

        // Add semi-transparent background panel behind text
        const panelEl = document.createElement('a-entity');
        panelEl.setAttribute('geometry', {
            primitive: 'plane',
            width: 20,
            height: 15
        });
        panelEl.setAttribute('material', {
            color: '#000000',
            opacity: 0.85,
            transparent: true
        });
        panelEl.setAttribute('position', '0 0 -0.05'); // Behind text

        textEl.appendChild(panelEl);
        this.el.appendChild(textEl);
        this.statusText = textEl;

        this.log.debug('Status display created on large screen');
    },

    onStateChange: function (state, context) {
        this.lastState = state;
        this.lastContext = context;
        this.updateDisplay();
    },

    updateDisplay: function () {
        if (!this.statusText || !this.lastContext) return;

        // Wording and layout live in src/client/status.ts (unit-tested)
        const team = (window.CURRENT_TEAM || 'blue').toUpperCase();
        const lines = [`EQUIPE ${team}`,...window.CosmicChef.describeHeadChefStatus(this.lastState, this.lastContext)];

        const textAttr = this.statusText.getAttribute('text');
        textAttr.value = lines.join('\n');
        this.statusText.setAttribute('text', textAttr);
    },

    remove: function () {
        if (this.statusText && this.statusText.parentNode) {
            this.statusText.remove();
        }
        if (this.updateHandle) {
            clearInterval(this.updateHandle);
        }
        this.log.debug('Head Chef status display removed');
    }
});
