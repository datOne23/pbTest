// ============================================================
// HISTORY / UNDO / REDO
// ============================================================

(function() {
    'use strict';

    const state = window.__PB_STATE;
    const { history, historyIndex, MAX_HISTORY } = window.__PB_HISTORY;

    function pushHistory() {
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }
        const snapshot = {
            canvases: JSON.parse(JSON.stringify(state.canvases)),
            packages: JSON.parse(JSON.stringify(state.packages)),
            styles: JSON.parse(JSON.stringify(state.styles)),
            assets: JSON.parse(JSON.stringify(state.assets)),
            nextId: state.nextId,
            selectedCanvasId: state.selectedCanvasId,
            selectedElementId: state.selectedElementId,
        };
        history.push(snapshot);
        if (history.length > MAX_HISTORY) history.shift();
        historyIndex = history.length - 1;

        // Update exposed refs
        window.__PB_HISTORY.history = history;
        window.__PB_HISTORY.historyIndex = historyIndex;
    }

    function restoreSnapshot(snapshot) {
        state.canvases = JSON.parse(JSON.stringify(snapshot.canvases));
        state.packages = JSON.parse(JSON.stringify(snapshot.packages));
        state.styles = JSON.parse(JSON.stringify(snapshot.styles));
        state.assets = JSON.parse(JSON.stringify(snapshot.assets));
        state.nextId = snapshot.nextId;
        state.selectedCanvasId = snapshot.selectedCanvasId;
        state.selectedElementId = snapshot.selectedElementId;

        // Recreate blob URLs for assets
        const { dataURLToBlob } = window.__PB_UTILS;
        for (const asset of state.assets) {
            if (asset.data && asset.data.startsWith('data:')) {
                const blob = dataURLToBlob(asset.data);
                const url = URL.createObjectURL(blob);
                state.assetBlobMap[asset.id] = url;
                asset.url = url;
            }
        }

        for (const c of state.canvases) {
            if (!c.layers.some(l => l.isBuffer)) {
                const buffer = {
                    id: window.__PB_UTILS.uid(),
                    name: 'Buffer',
                    elements: [],
                    isBuffer: true,
                    locked: true,
                };
                c.layers.push(buffer);
            }
        }

        if (window.__PB_RENDER) window.__PB_RENDER.renderAll();
    }

    function undo() {
        if (historyIndex > 0) {
            historyIndex--;
            restoreSnapshot(history[historyIndex]);
            window.__PB_HISTORY.historyIndex = historyIndex;
        }
    }

    function redo() {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            restoreSnapshot(history[historyIndex]);
            window.__PB_HISTORY.historyIndex = historyIndex;
        }
    }

    window.__PB_HISTORY.pushHistory = pushHistory;
    window.__PB_HISTORY.restoreSnapshot = restoreSnapshot;
    window.__PB_HISTORY.undo = undo;
    window.__PB_HISTORY.redo = redo;

})();