// ============================================================
// CORE - State, Utilities, Finders
// ============================================================

(function() {
    'use strict';

    // ---- STATE ----
    const state = {
        canvases: [],
        packages: [],
        styles: {},
        assets: [],
        assetBlobMap: {},
        selectedCanvasId: null,
        selectedElementId: null,
        zoom: 1,
        panX: 0,
        panY: 0,
        deviceMode: 'desktop',
        nextId: 1,
        history: [],
        historyIndex: -1,
    };

    // ---- UTILITIES ----
    function uid() {
        return state.nextId++;
    }

    function getDeviceScale() {
        // Simple scale factor; could be refined
        return 1;
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

    function dataURLToBlob(dataURL) {
        const parts = dataURL.split(',');
        const mime = parts[0].match(/:(.*?);/)[1];
        const bstr = atob(parts[1]);
        const n = bstr.length;
        const u8arr = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            u8arr[i] = bstr.charCodeAt(i);
        }
        return new Blob([u8arr], { type: mime });
    }

    // ---- FINDERS ----
    function findCanvas(canvasId) {
        return state.canvases.find(c => c.id === canvasId);
    }

    function findElement(elementId) {
        for (const canvas of state.canvases) {
            for (const layer of canvas.layers) {
                const found = findElementInArray(layer.elements, elementId);
                if (found) return found;
            }
        }
        for (const pkg of state.packages) {
            const found = findElementInArray(pkg.elements, elementId);
            if (found) return found;
        }
        return null;
    }

    function findElementInArray(arr, elementId) {
        for (const el of arr) {
            if (el.id === elementId) return el;
            if (el.children) {
                const found = findElementInArray(el.children, elementId);
                if (found) return found;
            }
        }
        return null;
    }

    function getParentCanvas(elementId) {
        for (const canvas of state.canvases) {
            for (const layer of canvas.layers) {
                if (findElementInArray(layer.elements, elementId)) {
                    return canvas;
                }
            }
        }
        return null;
    }

    function getParentPackage(elementId) {
        for (const pkg of state.packages) {
            if (findElementInArray(pkg.elements, elementId)) {
                return pkg;
            }
        }
        return null;
    }

    function getParentElement(elementId) {
        for (const canvas of state.canvases) {
            for (const layer of canvas.layers) {
                const parent = getParentInArray(layer.elements, elementId);
                if (parent) return parent;
            }
        }
        for (const pkg of state.packages) {
            const parent = getParentInArray(pkg.elements, elementId);
            if (parent) return parent;
        }
        return null;
    }

    function getParentInArray(arr, elementId) {
        for (const el of arr) {
            if (el.children && el.children.some(child => child.id === elementId)) {
                return el;
            }
            if (el.children) {
                const found = getParentInArray(el.children, elementId);
                if (found) return found;
            }
        }
        return null;
    }

    function getElementContainer(elementId) {
        for (const canvas of state.canvases) {
            for (const layer of canvas.layers) {
                const idx = layer.elements.findIndex(e => e.id === elementId);
                if (idx !== -1) return layer.elements;
                const parent = getParentInArray(layer.elements, elementId);
                if (parent && parent.children) {
                    if (parent.children.some(e => e.id === elementId)) {
                        return parent.children;
                    }
                }
            }
        }
        for (const pkg of state.packages) {
            const idx = pkg.elements.findIndex(e => e.id === elementId);
            if (idx !== -1) return pkg.elements;
            const parent = getParentInArray(pkg.elements, elementId);
            if (parent && parent.children) {
                if (parent.children.some(e => e.id === elementId)) {
                    return parent.children;
                }
            }
        }
        return null;
    }

    function getContainingLayer(elementId) {
        for (const canvas of state.canvases) {
            for (const layer of canvas.layers) {
                if (findElementInArray(layer.elements, elementId)) {
                    return layer;
                }
            }
        }
        return null;
    }

    function getBufferLayer(canvas) {
        return canvas.layers.find(l => l.isBuffer);
    }

    // ---- CONSTANTS ----
    const FONT_LIST = [
        'Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
        'Courier New', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Comic Sans MS'
    ];

    // ---- EXPOSE ----
    window.PB = window.PB || {};
    window.PB.core = {
        state,
        uid,
        getDeviceScale,
        getAnchorStyles,
        dataURLToBlob,
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
        FONT_LIST,
    };
})();