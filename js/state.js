// ============================================================
// STATE MANAGEMENT
// ============================================================

(function() {
    'use strict';

    // ---- STATE ----
    const state = {
        canvases: [],
        selectedCanvasId: null,
        selectedElementId: null,
        packages: [],
        styles: {},
        nextId: 1,
        clipboard: null,
        deviceMode: 'desktop',
        zoom: 1,
        panX: 0,
        panY: 0,
        assets: [],
        assetBlobMap: {}, // maps asset id to blob URL
    };

    const MAX_HISTORY = 50;
    let history = [];
    let historyIndex = -1;

    window.__PB_STATE = state;
    window.__PB_HISTORY = { history, historyIndex, MAX_HISTORY };

})();