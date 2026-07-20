// ============================================================
// ELEMENT FINDERS & CONTAINER HELPERS
// ============================================================

(function() {
    'use strict';

    const state = window.__PB_STATE;

    function findCanvas(id) {
        return state.canvases.find(c => c.id === id);
    }

    function findElement(id) {
        for (const c of state.canvases) {
            for (const layer of c.layers) {
                const el = findElementInArray(layer.elements, id);
                if (el) return el;
            }
        }
        for (const pkg of state.packages) {
            const el = findElementInArray(pkg.elements, id);
            if (el) return el;
        }
        return null;
    }

    function findElementInArray(arr, id) {
        for (const el of arr) {
            if (el.id === id) return el;
            if (el.children) {
                const found = findElementInArray(el.children, id);
                if (found) return found;
            }
        }
        return null;
    }

    function getParentCanvas(elId) {
        for (const c of state.canvases) {
            for (const layer of c.layers) {
                if (findElementInArray(layer.elements, elId)) return c;
            }
        }
        return null;
    }

    function getParentPackage(elId) {
        for (const pkg of state.packages) {
            if (findElementInArray(pkg.elements, elId)) return pkg;
        }
        return null;
    }

    function getParentElement(elId) {
        for (const c of state.canvases) {
            for (const layer of c.layers) {
                const p = getParentInArray(layer.elements, elId);
                if (p) return p;
            }
        }
        for (const pkg of state.packages) {
            const p = getParentInArray(pkg.elements, elId);
            if (p) return p;
        }
        return null;
    }

    function getParentInArray(arr, elId) {
        for (const el of arr) {
            if (el.children) {
                if (el.children.some(ch => ch.id === elId)) return el;
                const found = getParentInArray(el.children, elId);
                if (found) return found;
            }
        }
        return null;
    }

    function getElementContainer(elId) {
        const parent = getParentElement(elId);
        if (parent) return parent.children;
        for (const c of state.canvases) {
            for (const layer of c.layers) {
                const idx = layer.elements.findIndex(e => e.id === elId);
                if (idx !== -1) return layer.elements;
            }
        }
        for (const pkg of state.packages) {
            const idx = pkg.elements.findIndex(e => e.id === elId);
            if (idx !== -1) return pkg.elements;
        }
        return null;
    }

    function getContainingLayer(elId) {
        for (const c of state.canvases) {
            for (const layer of c.layers) {
                if (findElementInArray(layer.elements, elId)) return layer;
            }
        }
        return null;
    }

    function getBufferLayer(canvas) {
        return canvas.layers.find(l => l.isBuffer);
    }

    window.__PB_FINDERS = {
        findCanvas,
        findElement,
        findElementInArray,
        getParentCanvas,
        getParentPackage,
        getParentElement,
        getParentInArray,
        getElementContainer,
        getContainingLayer,
        getBufferLayer,
    };

})();