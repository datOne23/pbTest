// state.js - State management, history, and utility functions

const FONT_LIST = [
    'Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
    'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
    'Playfair Display', 'Merriweather', 'Oswald', 'Raleway',
    'Nunito', 'Quicksand', 'Work Sans', 'Source Sans Pro',
    'Titillium Web', 'Josefin Sans', 'Ubuntu', 'Dancing Script',
    'Pacifico', 'Shadows Into Light', 'Great Vibes'
];

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
    assetBlobMap: {},
};

const MAX_HISTORY = 50;
let history = [];
let historyIndex = -1;

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
}

function restoreSnapshot(snapshot) {
    state.canvases = JSON.parse(JSON.stringify(snapshot.canvases));
    state.packages = JSON.parse(JSON.stringify(snapshot.packages));
    state.styles = JSON.parse(JSON.stringify(snapshot.styles));
    state.assets = JSON.parse(JSON.stringify(snapshot.assets));
    state.nextId = snapshot.nextId;
    state.selectedCanvasId = snapshot.selectedCanvasId;
    state.selectedElementId = snapshot.selectedElementId;
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
                id: uid(),
                name: 'Buffer',
                elements: [],
                isBuffer: true,
                locked: true,
            };
            c.layers.push(buffer);
        }
    }
    renderAll();
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        restoreSnapshot(history[historyIndex]);
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        restoreSnapshot(history[historyIndex]);
    }
}

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

function removeElement(elId) {
    const container = getElementContainer(elId);
    if (container) {
        const idx = container.findIndex(e => e.id === elId);
        if (idx !== -1) {
            container.splice(idx, 1);
            return true;
        }
    }
    return false;
}

function bringToFront(elId) {
    const container = getElementContainer(elId);
    if (container) {
        const idx = container.findIndex(e => e.id === elId);
        if (idx !== -1) {
            const [el] = container.splice(idx, 1);
            container.push(el);
        }
    }
}

function sendToBack(elId) {
    const container = getElementContainer(elId);
    if (container) {
        const idx = container.findIndex(e => e.id === elId);
        if (idx !== -1) {
            const [el] = container.splice(idx, 1);
            container.unshift(el);
        }
    }
}

function bringForward(elId) {
    const container = getElementContainer(elId);
    if (container) {
        const idx = container.findIndex(e => e.id === elId);
        if (idx !== -1 && idx < container.length - 1) {
            const [el] = container.splice(idx, 1);
            container.splice(idx + 1, 0, el);
        }
    }
}

function sendBackward(elId) {
    const container = getElementContainer(elId);
    if (container) {
        const idx = container.findIndex(e => e.id === elId);
        if (idx !== -1 && idx > 0) {
            const [el] = container.splice(idx, 1);
            container.splice(idx - 1, 0, el);
        }
    }
}

function updateBoxColumns(box) {
    const rows = box.gridRows || 1;
    const cols = box.gridCols || 1;
    const totalCells = rows * cols;
    const currentChildren = box.children || [];
    const newChildren = [];
    for (let i = 0; i < totalCells; i++) {
        if (currentChildren[i]) {
            newChildren.push(currentChildren[i]);
        } else {
            newChildren.push({
                id: uid(),
                type: 'column',
                children: [],
                widthPct: 100 / cols,
            });
        }
    }
    box.children = newChildren;
}

function getBufferLayer(canvas) {
    return canvas.layers.find(l => l.isBuffer);
}

function cloneElements(arr) {
    return arr.map(el => {
        const clone = { ...el };
        clone.id = uid();
        if (el.children) {
            clone.children = cloneElements(el.children);
        }
        return clone;
    });
}

function showCanvasInBuffer(targetCanvas, sourceCanvas) {
    const buffer = getBufferLayer(targetCanvas);
    if (buffer) {
        buffer.elements = cloneElements(sourceCanvas.layers[0].elements);
    }
}
