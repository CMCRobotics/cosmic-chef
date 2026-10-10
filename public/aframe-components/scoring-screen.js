/**
 * scoring-screen.js
 * Shows each team's current score on the large screen. Text comes from
 * describeScoreboard (src/client/scoreboard.ts); each line takes its team's colour.
 *
 * Usage: <a-entity scoring-screen position="0 2.7 -5.2"></a-entity>
 */

AFRAME.registerComponent('scoring-screen', {
    init: function () {
        this.log = window.log.getLogger('scoring-screen');
        this.log.debug('Initializing scoring-screen');

        this.createRows();

        this.onScoresChanged = (evt) => this.render(evt.detail.scores);
        this.el.sceneEl.addEventListener('scores-changed', this.onScoresChanged);

        // The client may already hold scores from before this component initialised
        const client = this.el.sceneEl.components['scoring-mqtt-client'];
        if (client) {
            this.render(client.getScores());
        }
    },

    createRows: function () {
        this.rowEls = [];

        const titleEl = this.createText(1.0, '#ffffff');
        titleEl.setAttribute('text', 'value', 'SCORE');
        this.titleEl = titleEl;

        // One line per team, in TEAM_IDS order (the same order describeScoreboard uses)
        window.CosmicChef.TEAM_IDS.forEach((teamId, i) => {
            this.rowEls.push(this.createText(0.3 - i * 0.7, '#cccccc'));
        });
    },

    createText: function (y, color) {
        const textEl = document.createElement('a-entity');
        textEl.setAttribute('text', {
            value: '',
            align: 'center',
            anchor: 'center',
            baseline: 'center',
            width: 50,
            color: color,
            wrapCount: 100,
            fontSize: 120
        });
        textEl.setAttribute('position', `0 ${y} 0.1`);
        textEl.setAttribute('scale', '0.4 0.4 0.4');
        this.el.appendChild(textEl);
        return textEl;
    },

    render: function (scores) {
        const lines = window.CosmicChef.describeScoreboard(scores);
        this.rowEls.forEach((textEl, i) => {
            textEl.setAttribute('text', 'value', lines[i]);
            textEl.setAttribute('text', 'color', scores[i].color || '#cccccc');
        });
    },

    remove: function () {
        this.el.sceneEl.removeEventListener('scores-changed', this.onScoresChanged);
        this.titleEl.remove();
        this.rowEls.forEach((textEl) => textEl.remove());
        this.log.debug('Scoring screen removed');
    }
});
