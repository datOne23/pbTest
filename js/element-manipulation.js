// ============================================================
// ELEMENT MANIPULATION
// ============================================================

(function() {
    'use strict';

    const state = window.__PB_STATE;
    const { getElementContainer, getContainingLayer, findElement } = window.__PB_FINDERS;
    const { uid } = window.__PB_UTILS;

    function removeElement(elId) {
        const container = getElementContainer(elId);
        if (!container) return false;
        const idx = container.findIndex(e => e.id === elId);
        if (idx === -1) return false;
        container.splice(idx, 1);
        if (state.selectedElementId === elId) state.selectedElementId = null;
        return true;
    }

    function bringToFront(elId) {
        const container = getElementContainer(elId);
        if (!container) return;
        const idx = container.findIndex(e => e.id === elId);
        if (idx === -1 || idx === 0) return;
        const [el] = container.splice(idx, 1);
        container.unshift(el);
    }

    function sendToBack(elId) {
        const container = getElementContainer(elId);
        if (!container) return;
        const idx = container.findIndex(e => e.id === elId);
        if (idx === -1 || idx === container.length - 1) return;
        const [el] = container.splice(idx, 1);
        container.push(el);
    }

    function bringForward(elId) {
        const container = getElementContainer(elId);
        if (!container) return;
        const idx = container.findIndex(e => e.id === elId);
        if (idx <= 0) return;
        [container[idx], container[idx - 1]] = [container[idx - 1], container[idx]];
    }

    function sendBackward(elId) {
        const container = getElementContainer(elId);
        if (!container) return;
        const idx = container.findIndex(e => e.id === elId);
        if (idx === -1 || idx >= container.length - 1) return;
        [container[idx], container[idx + 1]] = [container[idx + 1], container[idx]];
    }

    function selectElement(id) {
        state.selectedElementId = id;
        if (window.__PB_RENDER) {
            window.__PB_RENDER.renderProperties();
            window.__PB_RENDER.renderLayersPanel();
            // Schedule canvas re-render
            if (!window.__PB_RENDER._selectionPending) {
                window.__PB_RENDER._selectionPending = true;
                requestAnimationFrame(() => {
                    window.__PB_RENDER._selectionPending = false;
                    window.__PB_RENDER.renderCanvases();
                });
            }
        }
    }

    function cloneElements(arr) {
        return arr.map(el => {
            const copy = JSON.parse(JSON.stringify(el));
            copy.id = uid();
            if (copy.children) {
                copy.children = cloneElements(copy.children);
            }
            return copy;
        });
    }

    window.__PB_MANIP = {
        removeElement,
        bringToFront,
        sendToBack,
        bringForward,
        sendBackward,
        selectElement,
        cloneElements,
    };

})();