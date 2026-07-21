// ============================================================
// ACTIONS - Manipulate state (create, delete, move, history, assets)
// ============================================================

(function() {
    'use strict';

    const core = window.PB.core;
    const state = core.state;
    const { uid, findElement, getElementContainer, getContainingLayer, getParentCanvas } = core;

    // ---- ELEMENT MANIPULATION ----
    function removeElement(elementId) {
        const container = getElementContainer(elementId);
        if (!container) return;
        const idx = container.findIndex(e => e.id === elementId);
        if (idx !== -1) {
            container.splice(idx, 1);
            if (state.selectedElementId === elementId) {
                state.selectedElementId = null;
            }
            pushHistory();
        }
    }

    function bringToFront(elementId) {
        const container = getElementContainer(elementId);
        if (!container) return;
        const idx = container.findIndex(e => e.id === elementId);
        if (idx !== -1) {
            const [el] = container.splice(idx, 1);
            container.push(el);
            pushHistory();
        }
    }

    function sendToBack(elementId) {
        const container = getElementContainer(elementId);
        if (!container) return;
        const idx = container.findIndex(e => e.id === elementId);
        if (idx !== -1) {
            const [el] = container.splice(idx, 1);
            container.unshift(el);
            pushHistory();
        }
    }

    function bringForward(elementId) {
        const container = getElementContainer(elementId);
        if (!container) return;
        const idx = container.findIndex(e => e.id === elementId);
        if (idx !== -1 && idx < container.length - 1) {
            [container[idx], container[idx + 1]] = [container[idx + 1], container[idx]];
            pushHistory();
        }
    }

    function sendBackward(elementId) {
        const container = getElementContainer(elementId);
        if (!container) return;
        const idx = container.findIndex(e => e.id === elementId);
        if (idx > 0) {
            [container[idx], container[idx - 1]] = [container[idx - 1], container[idx]];
            pushHistory();
        }
    }

    function selectElement(elementId) {
        state.selectedElementId = elementId;
        // re-render will be triggered by caller
    }

    function cloneElements(elements) {
        return JSON.parse(JSON.stringify(elements));
    }

    // ---- CREATE ----
    function createElement(type, props = {}) {
        const base = {
            id: uid(),
            type: type,
            margin: 0,
            padding: 0,
            customMargin: false,
            customPadding: false,
            marginTop: 0,
            marginRight: 0,
            marginBottom: 0,
            marginLeft: 0,
            paddingTop: 0,
            paddingRight: 0,
            paddingBottom: 0,
            paddingLeft: 0,
            opacity: 100,
            styles: {},
            anchor: 'tl',
            classes: [],
        };
        switch (type) {
            case 'box':
                return { ...base, gridRows: 1, gridCols: 1, children: [], bgColor: '#252525', borderSize: 1, borderColor: '#444', borderOpacity: 100, borderStyle: 'solid', useProportions: false, rowProportions: [], ...props };
            case 'column':
                return { ...base, children: [], bgColor: 'transparent', ...props };
            case 'text':
                return { ...base, content: 'Text', fontSize: 16, color: '#e0e0e0', fontFamily: 'Inter', fontWeight: '400', fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', letterSpacing: 0, lineHeight: 1.5, highlight: '', ...props };
            case 'media':
                return { ...base, src: '', alt: '', mediaType: 'image', poster: '', autoplay: false, loop: false, controls: true, sizeAdjust: 0, width: '', height: '', fit: 'fit', cornerRadius: 0, useIndividualRadius: false, cornerRadiusTL: 0, cornerRadiusTR: 0, cornerRadiusBR: 0, cornerRadiusBL: 0, shape: 'rectangle', cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0, assetId: null, ...props };
            case 'media-grid':
                return { ...base, layout: 'grid', gridCols: 3, fit: 'fit', cornerRadius: 0, items: [], ...props };
            case 'button':
                return { ...base, label: 'Button', action: 'link', actionUrl: '', actionTarget: '_blank', actionCanvas: '', actionDynamicBox: '', actionPackage: '', cornerRadius: 4, bgColor: '#2a5a8a', color: '#ffffff', borderSize: 0, borderColor: 'transparent', autoWidth: true, width: '', height: '', fontSize: 13, children: [], ...props };
            case 'dynamic-box':
                return { ...base, defaultPackage: null, autoAdapt: true, ...props };
            default:
                return { ...base, ...props };
        }
    }

    function createCanvas(name, width, height, kind, isMain = false) {
        const canvas = {
            id: uid(),
            name: name,
            width: width,
            height: height,
            kind: kind,
            isMain: isMain,
            bgColor: '#ffffff',
            layers: [],
            selectedLayerId: null,
        };
        // Add a default non-buffer layer
        const defaultLayer = { id: uid(), name: 'Layer 1', elements: [], locked: false };
        canvas.layers.push(defaultLayer);
        // Add buffer layer (always at end)
        const buffer = { id: uid(), name: 'Buffer', elements: [], isBuffer: true, locked: true };
        canvas.layers.push(buffer);
        canvas.selectedLayerId = defaultLayer.id;
        return canvas;
    }

    function updateBoxColumns(box) {
        // Ensure children array matches rows * cols
        const rows = box.gridRows || 1;
        const cols = box.gridCols || 1;
        const total = rows * cols;
        const children = box.children || [];
        while (children.length < total) {
            const col = createElement('column');
            children.push(col);
        }
        while (children.length > total) {
            children.pop();
        }
        box.children = children;
        // Adjust row proportions
        if (box.useProportions) {
            const rowProps = box.rowProportions || [];
            while (rowProps.length < rows) {
                rowProps.push(Array(cols).fill(100 / cols));
            }
            while (rowProps.length > rows) {
                rowProps.pop();
            }
            for (let r = 0; r < rows; r++) {
                const row = rowProps[r];
                while (row.length < cols) {
                    row.push(100 / cols);
                }
                while (row.length > cols) {
                    row.pop();
                }
            }
            box.rowProportions = rowProps;
        }
    }

    // ---- HISTORY ----
    function pushHistory() {
        const snapshot = JSON.stringify({
            canvases: state.canvases,
            packages: state.packages,
            styles: state.styles,
            assets: state.assets.map(a => ({ id: a.id, type: a.type, name: a.name, url: a.url, data: a.data })),
            selectedCanvasId: state.selectedCanvasId,
            selectedElementId: state.selectedElementId,
            nextId: state.nextId,
        });
        // Remove any future states
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(snapshot);
        state.historyIndex = state.history.length - 1;
        // Limit history size
        if (state.history.length > 100) {
            state.history.shift();
            state.historyIndex--;
        }
    }

    function undo() {
        if (state.historyIndex > 0) {
            state.historyIndex--;
            restoreHistory(state.history[state.historyIndex]);
        }
    }

    function redo() {
        if (state.historyIndex < state.history.length - 1) {
            state.historyIndex++;
            restoreHistory(state.history[state.historyIndex]);
        }
    }

    function restoreHistory(snapshot) {
        const data = JSON.parse(snapshot);
        state.canvases = data.canvases;
        state.packages = data.packages;
        state.styles = data.styles;
        state.assets = data.assets;
        state.selectedCanvasId = data.selectedCanvasId;
        state.selectedElementId = data.selectedElementId;
        state.nextId = data.nextId;
        // Recreate blob URLs for assets
        for (const asset of state.assets) {
            if (asset.data && asset.data.startsWith('data:')) {
                const blob = dataURLToBlob(asset.data);
                const url = URL.createObjectURL(blob);
                state.assetBlobMap[asset.id] = url;
                asset.url = url;
            }
        }
        // Trigger re-render via global render function
        if (window.PB && window.PB.renderers) {
            window.PB.renderers.renderAll();
        }
    }

    // ---- ASSET HANDLING ----
    function addAssetFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            const type = file.type.startsWith('video/') ? 'video' : file.type.startsWith('font/') ? 'font' : 'image';
            const asset = {
                id: uid(),
                type: type,
                name: file.name,
                url: dataUrl,
                data: dataUrl,
            };
            state.assets.push(asset);
            const blob = dataURLToBlob(dataUrl);
            const url = URL.createObjectURL(blob);
            state.assetBlobMap[asset.id] = url;
            asset.url = url;
            if (window.PB && window.PB.renderers) {
                window.PB.renderers.renderAssets();
                window.PB.renderers.renderAll();
            }
            pushHistory();
        };
        reader.readAsDataURL(file);
    }

    function addAssetLink() {
        const url = prompt('Enter asset URL:');
        if (!url) return;
        const name = prompt('Asset name:', url.split('/').pop() || 'asset');
        const type = url.match(/\.(mp4|webm|ogg)$/i) ? 'video' : url.match(/\.(woff|woff2|ttf|otf)$/i) ? 'font' : 'image';
        const asset = {
            id: uid(),
            type: type,
            name: name,
            url: url,
            data: null,
        };
        state.assets.push(asset);
        if (window.PB && window.PB.renderers) {
            window.PB.renderers.renderAssets();
            window.PB.renderers.renderAll();
        }
        pushHistory();
    }

    function handleAssetDrop(element, assetId) {
        const asset = state.assets.find(a => a.id === assetId);
        if (!asset) return;
        element.src = asset.url;
        element.mediaType = asset.type === 'video' ? 'video' : 'image';
        element.assetId = asset.id;
    }

    // ---- BUTTON ACTION ----
    function handleButtonAction(el) {
        const action = el.action || 'link';
        switch (action) {
            case 'link': {
                if (el.actionUrl) {
                    window.open(el.actionUrl, el.actionTarget || '_blank');
                }
                break;
            }
            case 'page': {
                const targetName = el.actionCanvas || '';
                const targetCanvas = state.canvases.find(c => c.name === targetName);
                if (!targetCanvas) return;
                const sourceCanvas = getParentCanvas(el.id);
                if (!sourceCanvas) return;
                showCanvasInBuffer(targetCanvas, sourceCanvas);
                break;
            }
            case 'dynamic': {
                const dbId = el.actionDynamicBox || '';
                const pkgName = el.actionPackage || '';
                const pkg = state.packages.find(p => p.name === pkgName);
                if (dbId && pkg) {
                    for (const c of state.canvases) {
                        for (const layer of c.layers) {
                            const found = findElementInArray(layer.elements, dbId);
                            if (found && found.type === 'dynamic-box') {
                                found.defaultPackage = pkg.id;
                                if (window.PB && window.PB.renderers) {
                                    window.PB.renderers.renderAll();
                                }
                                pushHistory();
                                return;
                            }
                        }
                    }
                }
                break;
            }
        }
    }

    function showCanvasInBuffer(targetCanvas, sourceCanvas) {
        if (!targetCanvas) return;
        const buffer = getBufferLayer(sourceCanvas);
        if (!buffer) return;
        buffer.elements = [];
        const cloned = cloneElements(targetCanvas.layers.reduce((acc, l) => acc.concat(l.elements), []));
        buffer.elements = cloned;
        if (window.PB && window.PB.renderers) {
            window.PB.renderers.renderAll();
        }
        pushHistory();
    }

    // ---- EXPOSE ----
    window.PB = window.PB || {};
    window.PB.actions = {
        removeElement,
        bringToFront,
        sendToBack,
        bringForward,
        sendBackward,
        selectElement,
        cloneElements,
        createElement,
        createCanvas,
        updateBoxColumns,
        pushHistory,
        undo,
        redo,
        addAssetFile,
        addAssetLink,
        handleAssetDrop,
        handleButtonAction,
        showCanvasInBuffer,
    };
})();