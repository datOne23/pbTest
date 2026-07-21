// ============================================================
// MAIN - Initialisation
// ============================================================

(function() {
    'use strict';

    // Ensure all modules are loaded
    if (!window.PB || !window.PB.core || !window.PB.actions || !window.PB.renderers || !window.PB.ui || !window.PB.export) {
        console.error('Page Builder: Not all modules loaded. Please include core.js, actions.js, renderers.js, ui.js, export.js');
        return;
    }

    // Setup event listeners and init
    window.PB.ui.setupEventListeners();
    window.PB.ui.init();

    console.log('Page Builder ready.');
})();