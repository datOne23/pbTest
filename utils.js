// ============================================================
// UTILITY FUNCTIONS
// ============================================================

(function() {
    'use strict';

    const state = window.__PB_STATE;

    function uid() {
        return state.nextId++;
    }

    function dataURLToBlob(dataURL) {
        const parts = dataURL.split(',');
        const mime = parts[0].match(/:(.*?);/)[1];
        const byteString = atob(parts[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mime });
    }

    function getAnchorStyles(anchor) {
        const map = {
            'tl': { justifyContent: 'flex-start', alignItems: 'flex-start' },
            'tc': { justifyContent: 'center', alignItems: 'flex-start' },
            'tr': { justifyContent: 'flex-end', alignItems: 'flex-start' },
            'ml': { justifyContent: 'flex-start', alignItems: 'center' },
            'mc': { justifyContent: 'center', alignItems: 'center' },
            'mr': { justifyContent: 'flex-end', alignItems: 'center' },
            'bl': { justifyContent: 'flex-start', alignItems: 'flex-end' },
            'bc': { justifyContent: 'center', alignItems: 'flex-end' },
            'br': { justifyContent: 'flex-end', alignItems: 'flex-end' },
        };
        return map[anchor] || map['tl'];
    }

    function getDeviceScale() {
        switch (state.deviceMode) {
            case 'desktop': return 0.4;
            case 'tablet': return 0.5;
            case 'phone': return 0.6;
            default: return 0.4;
        }
    }

    // ---- EXPOSE ----
    window.__PB_UTILS = {
        uid,
        dataURLToBlob,
        getAnchorStyles,
        getDeviceScale,
    };

})();