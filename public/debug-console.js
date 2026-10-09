/**
 * debug-console.js
 * With ?debug=true, keeps a copy of every warning and error in window.DEBUG_MESSAGES,
 * for debug-overlay to show inside the headset.
 *
 * Must load before vendor/bundle.js: loglevel binds the console methods when the bundle loads,
 * so the copy has to be in place by then.
 */

(function () {
    if (new URLSearchParams(window.location.search).get('debug') !== 'true') return;

    window.DEBUG_MESSAGES = [];

    const describe = (arg) => {
        if (arg instanceof Error) return arg.message;
        if (typeof arg === 'object' && arg !== null) {
            try {
                return JSON.stringify(arg);
            } catch (e) {
                return String(arg);
            }
        }
        return String(arg);
    };

    ['warn', 'error'].forEach((level) => {
        const original = console[level].bind(console);
        console[level] = (...args) => {
            original(...args);
            window.DEBUG_MESSAGES.push(`${level}: ${args.map(describe).join(' ')}`);
        };
    });

    window.addEventListener('error', (evt) => {
        window.DEBUG_MESSAGES.push(`uncaught: ${evt.message}`);
    });
    window.addEventListener('unhandledrejection', (evt) => {
        window.DEBUG_MESSAGES.push(`rejected: ${describe(evt.reason)}`);
    });
})();
