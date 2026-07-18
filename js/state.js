// State management for Page Builder

import { MAX_HISTORY } from './constants.js';

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

let history = [];
let historyIndex = -1;

export function getState() {
    return state;
}

export function getHistory() {
    return { history, historyIndex };
}

export function setHistory(h, i) {
    history = h;
    historyIndex = i;
}

export function pushHistory() {
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
}

export function restoreSnapshot(snapshot, dataURLToBlob) {
    state.canvases = JSON.parse(JSON.stringify(snapshot.canvases));
    state.packages = JSON.parse(JSON.stringify(snapshot.packages));
    state.styles = JSON.parse(JSON.stringify(snapshot.styles));
    state.assets = JSON.parse(JSON.stringify(snapshot.assets));
    state.nextId = snapshot.nextId;
    state.selectedCanvasId = snapshot.selectedCanvasId;
    state.selectedElementId = snapshot.selectedElementId;
    // Recreate blob URLs for assets
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
                id: state.nextId++,
                name: 'Buffer',
                elements: [],
                isBuffer: true,
                locked: true,
            };
            c.layers.push(buffer);
        }
    }
}

export function undo(restoreSnapshot, dataURLToBlob, renderAll) {
    if (historyIndex > 0) {
        historyIndex--;
        restoreSnapshot(history[historyIndex], dataURLToBlob);
        renderAll();
    }
}

export function redo(restoreSnapshot, dataURLToBlob, renderAll) {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        restoreSnapshot(history[historyIndex], dataURLToBlob);
        renderAll();
    }
}

export function uid() {
    return state.nextId++;
}

export function dataURLToBlob(dataURL) {
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

export function findCanvas(id) {
    return state.canvases.find(c => c.id === id);
}

export function findElement(id) {
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

export function findElementInArray(arr, id) {
    for (const el of arr) {
        if (el.id === id) return el;
        if (el.children) {
            const found = findElementInArray(el.children, id);
            if (found) return found;
        }
    }
    return null;
}

export function getParentCanvas(elId) {
    for (const c of state.canvases) {
        for (const layer of c.layers) {
            if (findElementInArray(layer.elements, elId)) return c;
        }
    }
    return null;
}

export function getParentPackage(elId) {
    for (const pkg of state.packages) {
        if (findElementInArray(pkg.elements, elId)) return pkg;
    }
    return null;
}

export function getParentElement(elId) {
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

export function getParentInArray(arr, elId) {
    for (const el of arr) {
        if (el.children) {
            if (el.children.some(ch => ch.id === elId)) return el;
            const found = getParentInArray(el.children, elId);
            if (found) return found;
        }
    }
    return null;
}

export function getElementContainer(elId) {
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

export function getContainingLayer(elId) {
    for (const c of state.canvases) {
        for (const layer of c.layers) {
            if (findElementInArray(layer.elements, elId)) return layer;
        }
    }
    return null;
}

export function getBufferLayer(canvas) {
    return canvas.layers.find(l => l.isBuffer);
}

export function cloneElements(elements) {
    return JSON.parse(JSON.stringify(elements));
}

export function removeElement(elId) {
    const container = getElementContainer(elId);
    if (!container) return false;
    const idx = container.findIndex(e => e.id === elId);
    if (idx === -1) return false;
    container.splice(idx, 1);
    if (state.selectedElementId === elId) state.selectedElementId = null;
    return true;
}

export function bringToFront(elId) {
    const container = getElementContainer(elId);
    if (!container) return;
    const idx = container.findIndex(e => e.id === elId);
    if (idx === -1 || idx === 0) return;
    const [el] = container.splice(idx, 1);
    container.unshift(el);
}

export function sendToBack(elId) {
    const container = getElementContainer(elId);
    if (!container) return;
    const idx = container.findIndex(e => e.id === elId);
    if (idx === -1 || idx === container.length - 1) return;
    const [el] = container.splice(idx, 1);
    container.push(el);
}

export function bringForward(elId) {
    const container = getElementContainer(elId);
    if (!container) return;
    const idx = container.findIndex(e => e.id === elId);
    if (idx <= 0) return;
    [container[idx], container[idx - 1]] = [container[idx - 1], container[idx]];
}

export function sendBackward(elId) {
    const container = getElementContainer(elId);
    if (!container) return;
    const idx = container.findIndex(e => e.id === elId);
    if (idx === -1 || idx >= container.length - 1) return;
    [container[idx], container[idx + 1]] = [container[idx + 1], container[idx]];
}
