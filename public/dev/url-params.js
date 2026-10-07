/**
 * url-params.js
 * Simple URL parameter parser for game configuration.
 */

window.URLParams = {
    /**
     * Get a URL parameter value, with optional default.
     * Usage: URLParams.get('team', 'team-1')
     */
    get: function(key, defaultValue) {
        const params = new URLSearchParams(window.location.search);
        return params.get(key) || defaultValue;
    },

    /**
     * Get all parameters as an object.
     */
    getAll: function() {
        const params = new URLSearchParams(window.location.search);
        const obj = {};
        for (const [key, value] of params) {
            obj[key] = value;
        }
        return obj;
    }
};
