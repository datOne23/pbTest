(function() {
            'use strict';

            // ---- COMMON FONTS ----
            const FONT_LIST = [
                'Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
                'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
                'Playfair Display', 'Merriweather', 'Oswald', 'Raleway',
                'Nunito', 'Quicksand', 'Work Sans', 'Source Sans Pro',
                'Titillium Web', 'Josefin Sans', 'Ubuntu', 'Dancing Script',
                'Pacifico', 'Shadows Into Light', 'Great Vibes'
            ];

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

            function undo() { if (historyIndex > 0) { historyIndex--;
                    restoreSnapshot(history[historyIndex]); } }

            function redo() { if (historyIndex < history.length - 1) { historyIndex++;
                    restoreSnapshot(history[historyIndex]); } }

            function uid() { return state.nextId++; }

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

            function findCanvas(id) { return state.canvases.find(c => c.id === id); }

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

            function updateBoxColumns(box) {
                const rows = box.gridRows || 1;
                const cols = box.gridCols || 1;
                const target = rows * cols;
                while (box.children.length < target) {
                    box.children.push({
                        id: uid(),
                        type: 'column',
                        children: [],
                        padding: box.padding || 0,
                        proportionWeight: 1,
                        bgColor: 'transparent',
                        customPadding: box.customPadding || false,
                        paddingTop: box.paddingTop || 0,
                        paddingRight: box.paddingRight || 0,
                        paddingBottom: box.paddingBottom || 0,
                        paddingLeft: box.paddingLeft || 0,
                    });
                }
                while (box.children.length > target) {
                    box.children.pop();
                }
                for (const col of box.children) {
                    if (col.proportionWeight === undefined) col.proportionWeight = 1;
                }
                if (!box.rowProportions || box.rowProportions.length !== rows) {
                    box.rowProportions = [];
                    for (let r = 0; r < rows; r++) {
                        const row = [];
                        for (let c = 0; c < cols; c++) {
                            row.push(100 / cols);
                        }
                        box.rowProportions.push(row);
                    }
                } else {
                    for (let r = 0; r < box.rowProportions.length; r++) {
                        while (box.rowProportions[r].length < cols) {
                            box.rowProportions[r].push(100 / cols);
                        }
                        while (box.rowProportions[r].length > cols) {
                            box.rowProportions[r].pop();
                        }
                    }
                    while (box.rowProportions.length < rows) {
                        const row = [];
                        for (let c = 0; c < cols; c++) {
                            row.push(100 / cols);
                        }
                        box.rowProportions.push(row);
                    }
                    while (box.rowProportions.length > rows) {
                        box.rowProportions.pop();
                    }
                }
            }

            function createElement(type, props = {}) {
                if (type === 'image') type = 'media';
                if (type === 'image-grid') type = 'media-grid';

                const base = {
                    id: uid(),
                    type: type,
                    styles: {},
                    classes: [],
                    children: [],
                    opacity: props.opacity !== undefined ? props.opacity : 100,
                    ...props,
                };
                const marginProps = {
                    customMargin: props.customMargin || false,
                    marginTop: props.marginTop || 0,
                    marginRight: props.marginRight || 0,
                    marginBottom: props.marginBottom || 0,
                    marginLeft: props.marginLeft || 0,
                    customPadding: props.customPadding || false,
                    paddingTop: props.paddingTop || 0,
                    paddingRight: props.paddingRight || 0,
                    paddingBottom: props.paddingBottom || 0,
                    paddingLeft: props.paddingLeft || 0,
                };
                const defaultAnchor = props.anchor || 'tl';

                switch (type) {
                    case 'box': {
                        const rows = props.gridRows || 1;
                        const cols = props.gridCols || 1;
                        const box = {
                            ...base,
                            ...marginProps,
                            gridRows: rows,
                            gridCols: cols,
                            useProportions: props.useProportions || false,
                            margin: props.margin || 0,
                            padding: props.padding || 0,
                            bgColor: props.bgColor || 'transparent',
                            borderSize: props.borderSize || 0,
                            borderColor: props.borderColor || 'transparent',
                            borderStyle: props.borderStyle || 'solid',
                            borderOpacity: props.borderOpacity !== undefined ? props.borderOpacity : 100,
                            rowProportions: [],
                            children: [],
                        };
                        for (let r = 0; r < rows; r++) {
                            const row = [];
                            for (let c = 0; c < cols; c++) {
                                row.push(100 / cols);
                            }
                            box.rowProportions.push(row);
                            for (let c = 0; c < cols; c++) {
                                box.children.push({
                                    id: uid(),
                                    type: 'column',
                                    children: [],
                                    padding: props.padding || 0,
                                    proportionWeight: 1,
                                    bgColor: 'transparent',
                                    customPadding: props.customPadding || false,
                                    paddingTop: props.paddingTop || 0,
                                    paddingRight: props.paddingRight || 0,
                                    paddingBottom: props.paddingBottom || 0,
                                    paddingLeft: props.paddingLeft || 0,
                                });
                            }
                        }
                        return box;
                    }
                    case 'dynamic-box':
                        return {
                            ...base,
                            ...marginProps,
                            id: props.id || 'db-' + uid(),
                            defaultPackage: props.defaultPackage || null,
                            autoAdapt: props.autoAdapt !== undefined ? props.autoAdapt : true,
                            children: [],
                        };
                    case 'text':
                        return {
                            ...base,
                            ...marginProps,
                            anchor: defaultAnchor,
                            content: props.content || 'Text',
                            fontFamily: props.fontFamily || 'Inter',
                            fontSize: props.fontSize || 16,
                            color: props.color || '#e0e0e0',
                            fontWeight: props.fontWeight || '400',
                            fontStyle: props.fontStyle || 'normal',
                            textDecoration: props.textDecoration || 'none',
                            textAlign: props.textAlign || 'left',
                            letterSpacing: props.letterSpacing || 0,
                            lineHeight: props.lineHeight || 1.5,
                            highlight: props.highlight || null,
                            children: [],
                        };
                    case 'media':
                        return {
                            ...base,
                            ...marginProps,
                            anchor: defaultAnchor,
                            src: props.src || '',
                            alt: props.alt || '',
                            fit: props.fit || 'fit',
                            sizeAdjust: props.sizeAdjust !== undefined ? props.sizeAdjust : 0,
                            width: props.width || '',
                            height: props.height || '',
                            margin: props.margin || 0,
                            cornerRadius: props.cornerRadius || 0,
                            shape: props.shape || 'rectangle',
                            cornerRadiusTL: props.cornerRadiusTL || 0,
                            cornerRadiusTR: props.cornerRadiusTR || 0,
                            cornerRadiusBL: props.cornerRadiusBL || 0,
                            cornerRadiusBR: props.cornerRadiusBR || 0,
                            useIndividualRadius: props.useIndividualRadius || false,
                            cropTop: props.cropTop || 0,
                            cropRight: props.cropRight || 0,
                            cropBottom: props.cropBottom || 0,
                            cropLeft: props.cropLeft || 0,
                            mediaType: props.mediaType || 'image',
                            poster: props.poster || '',
                            autoplay: props.autoplay || false,
                            loop: props.loop || false,
                            controls: props.controls !== undefined ? props.controls : true,
                            children: [],
                            assetId: props.assetId || null,
                        };
                    case 'media-grid':
                        return {
                            ...base,
                            ...marginProps,
                            items: props.items || [],
                            layout: props.layout || 'grid',
                            fit: props.fit || 'fit',
                            margin: props.margin || 0,
                            cornerRadius: props.cornerRadius || 0,
                            gridCols: props.gridCols || 3,
                            children: [],
                        };
                    case 'button': {
                        const btn = {
                            ...base,
                            ...marginProps,
                            anchor: defaultAnchor,
                            label: props.label || 'Button',
                            action: props.action || 'link',
                            actionUrl: props.actionUrl || '#',
                            actionTarget: props.actionTarget || '_blank',
                            actionCanvas: props.actionCanvas || '',
                            actionPackage: props.actionPackage || '',
                            actionDynamicBox: props.actionDynamicBox || '',
                            cornerRadius: props.cornerRadius || 4,
                            bgColor: props.bgColor || '#2a5a8a',
                            color: props.color || '#ffffff',
                            borderSize: props.borderSize || 0,
                            borderColor: props.borderColor || 'transparent',
                            fontSize: props.fontSize || 13,
                            width: props.width || '',
                            height: props.height || '',
                            autoWidth: props.autoWidth !== undefined ? props.autoWidth : true,
                            children: props.children || [],
                        };
                        if (!btn.children) btn.children = [];
                        return btn;
                    }
                    default:
                        return base;
                }
            }

            function createCanvas(name, w, h, category, isMain) {
                const defaultLayer = {
                    id: uid(),
                    name: 'Layer 1',
                    elements: [],
                    locked: false,
                };
                const bufferLayer = {
                    id: uid(),
                    name: 'Buffer',
                    elements: [],
                    isBuffer: true,
                    locked: true,
                };
                return {
                    id: uid(),
                    name: name || 'main',
                    width: w || 1920,
                    height: h || 1080,
                    category: category || 'main',
                    isMain: isMain || false,
                    bgColor: '#ffffff',
                    layers: [defaultLayer, bufferLayer],
                    selectedLayerId: defaultLayer.id,
                };
            }

            function getBufferLayer(canvas) {
                return canvas.layers.find(l => l.isBuffer);
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

            function showCanvasInBuffer(targetCanvas, sourceCanvas) {
                if (!sourceCanvas) return;
                const buffer = getBufferLayer(sourceCanvas);
                if (!buffer) return;
                buffer.elements = [];
                const cloned = cloneElements(targetCanvas.layers.reduce((acc, l) => acc.concat(l.elements), []));
                buffer.elements = cloned;
                renderAll();
                pushHistory();
            }

            function init() {
                const main = createCanvas('main', 1920, 1080, 'main', true);
                state.canvases.push(main);
                state.selectedCanvasId = main.id;

                const layer = main.layers[0];
                const box = createElement('box', { gridRows: 2, gridCols: 2, padding: 8, margin: 4 });
                layer.elements.push(box);
                const text = createElement('text', {
                    content: 'Welcome to Page Builder',
                    fontSize: 24,
                    color: '#000000',
                    fontWeight: '600',
                    textAlign: 'center',
                    anchor: 'mc'
                });
                if (box.children && box.children.length > 0) {
                    box.children[0].children.push(text);
                }

                document.querySelectorAll('.palette-item').forEach(item => { item.draggable = true; });

                pushHistory();
                renderAll();
            }

            const container = document.getElementById('canvas-scroll');
            const layersList = document.getElementById('layers-list');
            const packagesList = document.getElementById('packages-list');
            const propertiesContent = document.getElementById('properties-content');
            const assetsContainer = document.getElementById('asset-items-container');

            let pointerDownData = {};

            function renderAll() {
                renderCanvases();
                renderLayersPanel();
                renderPackages();
                renderProperties();
                renderAssets();
                updateToolbarState();
            }

            // -------- ASSETS --------
            function renderAssets() {
                assetsContainer.innerHTML = '';
                if (state.assets.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'text-muted';
                    empty.textContent = 'No assets yet';
                    assetsContainer.appendChild(empty);
                    return;
                }
                for (const asset of state.assets) {
                    const item = document.createElement('div');
                    item.className = 'asset-item';
                    item.draggable = true;
                    item.dataset.assetId = asset.id;
                    const thumb = document.createElement('img');
                    thumb.className = 'asset-thumb';
                    if (asset.type === 'image' || asset.type === 'video') {
                        thumb.src = asset.url || '';
                    } else {
                        thumb.src =
                            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="%23666" stroke-width="2"%3E%3Cpath d="M4 7h16M4 12h16M4 17h10"/%3E%3C/svg%3E';
                    }
                    item.appendChild(thumb);
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'asset-name';
                    nameSpan.textContent = asset.name;
                    item.appendChild(nameSpan);
                    const controls = document.createElement('span');
                    controls.className = 'asset-controls';
                    const delBtn = document.createElement('button');
                    delBtn.textContent = '✕';
                    delBtn.style.color = '#aa4444';
                    delBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        // Remove asset and revoke blob URL
                        const assetId = asset.id;
                        if (state.assetBlobMap[assetId]) {
                            URL.revokeObjectURL(state.assetBlobMap[assetId]);
                            delete state.assetBlobMap[assetId];
                        }
                        state.assets = state.assets.filter(a => a.id !== assetId);
                        renderAssets();
                        pushHistory();
                    });
                    controls.appendChild(delBtn);
                    item.appendChild(controls);
                    item.addEventListener('dragstart', (e) => {
                        e.dataTransfer.setData('text/plain', 'asset:' + asset.id);
                        e.dataTransfer.effectAllowed = 'copy';
                    });
                    assetsContainer.appendChild(item);
                }
            }

            function addAssetFile(file) {
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    const dataUrl = e.target.result;
                    const blob = dataURLToBlob(dataUrl);
                    const url = URL.createObjectURL(blob);
                    let type = 'image';
                    if (file.type.startsWith('video/')) type = 'video';
                    else if (file.type.startsWith('font/')) type = 'font';
                    else if (file.type.startsWith('image/')) type = 'image';
                    const asset = {
                        id: uid(),
                        type: type,
                        name: file.name,
                        url: url,
                        data: dataUrl,
                    };
                    state.assets.push(asset);
                    state.assetBlobMap[asset.id] = url;
                    renderAssets();
                    pushHistory();
                };
                reader.readAsDataURL(file);
            }

            function addAssetLink() {
                const url = prompt('Enter asset URL (image or video):');
                if (!url) return;
                let type = 'image';
                if (url.match(/\.(mp4|webm|ogg)$/i)) type = 'video';
                const name = url.split('/').pop() || 'asset';
                const asset = {
                    id: uid(),
                    type: type,
                    name: name,
                    url: url,
                    data: null,
                };
                state.assets.push(asset);
                renderAssets();
                pushHistory();
            }

            function handleAssetDrop(el, assetId) {
                const asset = state.assets.find(a => a.id === assetId);
                if (!asset) return;
                if (el.type === 'media') {
                    el.src = asset.url;
                    el.mediaType = asset.type === 'video' ? 'video' : 'image';
                    el.assetId = asset.id;
                    renderAll();
                    pushHistory();
                } else if (el.type === 'media-grid') {
                    if (!el.items) el.items = [];
                    el.items.push({
                        src: asset.url,
                        alt: asset.name,
                        mediaType: asset.type === 'video' ? 'video' : 'image',
                        poster: '',
                        assetId: asset.id,
                    });
                    renderAll();
                    pushHistory();
                }
            }

            // -------- RENDER CANVASES --------
            function renderCanvases() {
                container.innerHTML = '';
                for (const canvas of state.canvases) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'canvas-wrapper' + (canvas.isMain ? ' main-canvas' : '') +
                        (state.selectedCanvasId === canvas.id ? ' selected-canvas' : '');
                    wrapper.dataset.canvasId = canvas.id;
                    wrapper.draggable = true;

                    const header = document.createElement('div');
                    header.className = 'canvas-header';
                    const nameInput = document.createElement('input');
                    nameInput.className = 'cname';
                    nameInput.value = canvas.name;
                    nameInput.readOnly = canvas.isMain;
                    nameInput.addEventListener('change', () => {
                        if (!canvas.isMain) {
                            canvas.name = nameInput.value || 'untitled';
                            renderLayersPanel();
                            renderPackages();
                            pushHistory();
                        }
                    });
                    const cres = document.createElement('div');
                    cres.className = 'cres';
                    const wIn = document.createElement('input');
                    wIn.type = 'number';
                    wIn.value = canvas.width;
                    wIn.min = 100;
                    wIn.style.width = '44px';
                    wIn.addEventListener('mousedown', (e) => e.stopPropagation());
                    wIn.addEventListener('change', () => {
                        const v = parseInt(wIn.value) || 100;
                        canvas.width = v;
                        renderCanvases();
                        pushHistory();
                    });
                    const xSpan = document.createElement('span');
                    xSpan.textContent = 'x';
                    const hIn = document.createElement('input');
                    hIn.type = 'number';
                    hIn.value = canvas.height;
                    hIn.min = 100;
                    hIn.style.width = '44px';
                    hIn.addEventListener('mousedown', (e) => e.stopPropagation());
                    hIn.addEventListener('change', () => {
                        const v = parseInt(hIn.value) || 100;
                        canvas.height = v;
                        renderCanvases();
                        pushHistory();
                    });
                    cres.append(wIn, xSpan, hIn);

                    const actions = document.createElement('div');
                    actions.className = 'cactions';
                    const bgColorInput = document.createElement('input');
                    bgColorInput.type = 'color';
                    bgColorInput.value = canvas.bgColor || '#ffffff';
                    bgColorInput.title = 'Background color';
                    bgColorInput.addEventListener('input', (e) => {
                        canvas.bgColor = e.target.value;
                        const body = wrapper.querySelector('.canvas-body');
                        if (body) body.style.background = canvas.bgColor;
                    });
                    bgColorInput.addEventListener('change', () => { pushHistory(); });
                    const delBtn = document.createElement('button');
                    delBtn.textContent = 'x';
                    delBtn.className = 'danger';
                    delBtn.title = 'Delete canvas';
                    delBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (state.canvases.length <= 1 && canvas.isMain) {
                            return;
                        }
                        if (canvas.isMain && state.canvases.filter(c => c.isMain).length === 1) {
                            return;
                        }
                        state.canvases = state.canvases.filter(c => c.id !== canvas.id);
                        if (state.selectedCanvasId === canvas.id) {
                            state.selectedCanvasId = state.canvases[0]?.id || null;
                        }
                        renderAll();
                        pushHistory();
                    });
                    actions.append(bgColorInput, delBtn);

                    header.append(nameInput, cres, actions);
                    wrapper.appendChild(header);

                    const body = document.createElement('div');
                    body.className = 'canvas-body';
                    const scale = getDeviceScale();
                    const bw = canvas.width * scale;
                    const bh = canvas.height * scale;
                    body.style.width = bw + 'px';
                    body.style.height = bh + 'px';
                    body.style.minHeight = '100px';
                    body.style.minWidth = '100px';
                    body.style.background = canvas.bgColor || '#ffffff';
                    body.style.position = 'relative';
                    body.style.overflow = 'hidden';

                    const elementsDiv = document.createElement('div');
                    elementsDiv.className = 'canvas-elements';
                    elementsDiv.style.width = '100%';
                    elementsDiv.style.height = '100%';
                    elementsDiv.style.position = 'relative';
                    elementsDiv.style.overflow = 'auto';

                    const sortedLayers = canvas.layers.slice().sort((a, b) => {
                        if (a.isBuffer) return 1;
                        if (b.isBuffer) return -1;
                        return 0;
                    });
                    for (let i = 0; i < sortedLayers.length; i++) {
                        const layer = sortedLayers[i];
                        const isBuffer = layer.isBuffer || false;
                        if (isBuffer && layer.elements.length === 0) continue;
                        const layerDiv = document.createElement('div');
                        layerDiv.className = 'canvas-layer' + (isBuffer ? ' buffer-layer' : '') +
                            (layer.locked ? ' locked' : '');
                        layerDiv.dataset.layerId = layer.id;
                        layerDiv.style.zIndex = i;
                        layerDiv.style.position = 'absolute';
                        layerDiv.style.top = '0';
                        layerDiv.style.left = '0';
                        layerDiv.style.width = '100%';
                        layerDiv.style.height = '100%';
                        layerDiv.style.overflow = 'auto';
                        layerDiv.style.border = '1px dashed transparent';
                        const pad = 4 * scale;
                        layerDiv.style.padding = pad + 'px';
                        layerDiv.style.boxSizing = 'border-box';

                        const dropZone = document.createElement('div');
                        dropZone.className = 'layer-drop-zone';
                        dropZone.dataset.layerId = layer.id;
                        dropZone.style.minHeight = '100%';
                        dropZone.style.width = '100%';
                        dropZone.style.display = 'flex';
                        dropZone.style.flexDirection = 'column';

                        if (layer.elements.length === 0) {
                            const hint = document.createElement('div');
                            hint.style.color = '#555';
                            hint.style.fontSize = (11 * scale) + 'px';
                            hint.style.padding = (4 * scale) + 'px';
                            hint.textContent = isBuffer ? 'Buffer (page overlay) - locked' : 'Drop elements here';
                            dropZone.appendChild(hint);
                        } else {
                            for (const el of layer.elements) {
                                const elNode = renderElement(el, scale);
                                if (elNode) dropZone.appendChild(elNode);
                            }
                        }

                        if (!isBuffer && !layer.locked) {
                            layerDiv.addEventListener('dragover', (e) => {
                                e.preventDefault();
                                layerDiv.classList.add('drag-over');
                            });
                            layerDiv.addEventListener('dragleave', () => {
                                layerDiv.classList.remove('drag-over');
                            });
                            layerDiv.addEventListener('drop', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                layerDiv.classList.remove('drag-over');
                                const data = e.dataTransfer.getData('text/plain');
                                if (!data) return;
                                if (data.startsWith('el:')) {
                                    const elId = parseInt(data.substring(3));
                                    const el = findElement(elId);
                                    if (!el) return;
                                    const oldContainer = getElementContainer(elId);
                                    if (!oldContainer) return;
                                    const idx = oldContainer.findIndex(e => e.id === elId);
                                    if (idx !== -1) {
                                        oldContainer.splice(idx, 1);
                                    }
                                    layer.elements.push(el);
                                    renderAll();
                                    pushHistory();
                                    selectElement(el.id);
                                } else if (data.startsWith('asset:')) {
                                    const assetId = parseInt(data.substring(6));
                                    const newEl = createElement('media');
                                    handleAssetDrop(newEl, assetId);
                                    layer.elements.push(newEl);
                                    renderAll();
                                    pushHistory();
                                    selectElement(newEl.id);
                                } else {
                                    const type = data;
                                    const newEl = createElement(type);
                                    layer.elements.push(newEl);
                                    renderAll();
                                    pushHistory();
                                    selectElement(newEl.id);
                                }
                            });

                            dropZone.addEventListener('dragover', (e) => {
                                e.preventDefault();
                                layerDiv.classList.add('drag-over');
                            });
                            dropZone.addEventListener('dragleave', () => {
                                layerDiv.classList.remove('drag-over');
                            });
                            dropZone.addEventListener('drop', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                layerDiv.classList.remove('drag-over');
                                const data = e.dataTransfer.getData('text/plain');
                                if (!data) return;
                                if (data.startsWith('el:')) {
                                    const elId = parseInt(data.substring(3));
                                    const el = findElement(elId);
                                    if (!el) return;
                                    const oldContainer = getElementContainer(elId);
                                    if (!oldContainer) return;
                                    const idx = oldContainer.findIndex(e => e.id === elId);
                                    if (idx !== -1) {
                                        oldContainer.splice(idx, 1);
                                    }
                                    layer.elements.push(el);
                                    renderAll();
                                    pushHistory();
                                    selectElement(el.id);
                                } else if (data.startsWith('asset:')) {
                                    const assetId = parseInt(data.substring(6));
                                    const newEl = createElement('media');
                                    handleAssetDrop(newEl, assetId);
                                    layer.elements.push(newEl);
                                    renderAll();
                                    pushHistory();
                                    selectElement(newEl.id);
                                } else {
                                    const type = data;
                                    const newEl = createElement(type);
                                    layer.elements.push(newEl);
                                    renderAll();
                                    pushHistory();
                                    selectElement(newEl.id);
                                }
                            });
                        } else {
                            layerDiv.style.cursor = 'default';
                            dropZone.style.cursor = 'default';
                        }

                        layerDiv.appendChild(dropZone);
                        elementsDiv.appendChild(layerDiv);
                    }

                    body.addEventListener('dragover', (e) => e.preventDefault());
                    body.addEventListener('drop', (e) => {
                        e.preventDefault();
                        const selectedLayer = canvas.layers.find(l => l.id === canvas.selectedLayerId);
                        if (!selectedLayer || selectedLayer.isBuffer || selectedLayer.locked) return;
                        const data = e.dataTransfer.getData('text/plain');
                        if (!data) return;
                        if (data.startsWith('el:')) {
                            const elId = parseInt(data.substring(3));
                            const el = findElement(elId);
                            if (!el) return;
                            const oldContainer = getElementContainer(elId);
                            if (!oldContainer) return;
                            const idx = oldContainer.findIndex(e => e.id === elId);
                            if (idx !== -1) {
                                oldContainer.splice(idx, 1);
                            }
                            selectedLayer.elements.push(el);
                            renderAll();
                            pushHistory();
                            selectElement(el.id);
                        } else if (data.startsWith('asset:')) {
                            const assetId = parseInt(data.substring(6));
                            const newEl = createElement('media');
                            handleAssetDrop(newEl, assetId);
                            selectedLayer.elements.push(newEl);
                            renderAll();
                            pushHistory();
                            selectElement(newEl.id);
                        } else {
                            const type = data;
                            const newEl = createElement(type);
                            selectedLayer.elements.push(newEl);
                            renderAll();
                            pushHistory();
                            selectElement(newEl.id);
                        }
                    });

                    body.appendChild(elementsDiv);
                    wrapper.appendChild(body);

                    // Height resize bar
                    const heightBar = document.createElement('div');
                    heightBar.className = 'height-resize-bar';
                    heightBar.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const startY = e.clientY;
                        const startH = canvas.height;
                        const onMove = (ev) => {
                            const dy = (ev.clientY - startY) / scale;
                            const newH = Math.max(100, startH + dy);
                            canvas.height = newH;
                            const bodyEl = wrapper.querySelector('.canvas-body');
                            if (bodyEl) bodyEl.style.height = (newH * scale) + 'px';
                            const hInput = wrapper.querySelector('.cres input:last-child');
                            if (hInput) hInput.value = newH;
                        };
                        const onUp = () => {
                            document.removeEventListener('mousemove', onMove);
                            document.removeEventListener('mouseup', onUp);
                            pushHistory();
                        };
                        document.addEventListener('mousemove', onMove);
                        document.addEventListener('mouseup', onUp);
                    });
                    wrapper.appendChild(heightBar);

                    // Resize handle
                    const handle = document.createElement('div');
                    handle.className = 'resize-handle';
                    handle.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const startX = e.clientX;
                        const startY = e.clientY;
                        const startW = canvas.width;
                        const startH = canvas.height;
                        const onMove = (ev) => {
                            const dx = (ev.clientX - startX) / scale;
                            const dy = (ev.clientY - startY) / scale;
                            canvas.width = Math.max(100, startW + dx);
                            canvas.height = Math.max(100, startH + dy);
                            renderCanvases();
                        };
                        const onUp = () => {
                            document.removeEventListener('mousemove', onMove);
                            document.removeEventListener('mouseup', onUp);
                            pushHistory();
                        };
                        document.addEventListener('mousemove', onMove);
                        document.addEventListener('mouseup', onUp);
                    });
                    wrapper.appendChild(handle);

                    wrapper.addEventListener('mousedown', (e) => {
                        if (e.target.closest('input') || e.target.closest('button')) return;
                        if (!e.target.closest('.el-box') && !e.target.closest('.el-text') &&
                            !e.target.closest('.el-media') && !e.target.closest('.el-media-grid') &&
                            !e.target.closest('.el-button-container') && !e.target.closest('.el-dynamic-box')) {
                            state.selectedCanvasId = canvas.id;
                            state.selectedElementId = null;
                            renderAll();
                        }
                    });

                    wrapper.addEventListener('dragstart', (e) => {
                        e.dataTransfer.setData('text/canvas-id', canvas.id);
                        e.dataTransfer.effectAllowed = 'move';
                        wrapper.classList.add('dragging');
                    });
                    wrapper.addEventListener('dragend', () => {
                        wrapper.classList.remove('dragging');
                    });
                    wrapper.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        wrapper.classList.add('drag-over');
                    });
                    wrapper.addEventListener('dragleave', () => {
                        wrapper.classList.remove('drag-over');
                    });
                    wrapper.addEventListener('drop', (e) => {
                        e.preventDefault();
                        wrapper.classList.remove('drag-over');
                        const draggedId = e.dataTransfer.getData('text/canvas-id');
                        if (draggedId && draggedId !== canvas.id) {
                            const draggedIndex = state.canvases.findIndex(c => c.id === parseInt(draggedId));
                            const targetIndex = state.canvases.findIndex(c => c.id === canvas.id);
                            if (draggedIndex !== -1 && targetIndex !== -1) {
                                const [removed] = state.canvases.splice(draggedIndex, 1);
                                state.canvases.splice(targetIndex, 0, removed);
                                renderAll();
                                pushHistory();
                            }
                        }
                    });

                    wrapper.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        showContextMenu(e.clientX, e.clientY, canvas.id, null);
                    });

                    container.appendChild(wrapper);
                }
                applyZoomPan();
            }

            function getDeviceScale() {
                switch (state.deviceMode) {
                    case 'desktop':
                        return 0.4;
                    case 'tablet':
                        return 0.5;
                    case 'phone':
                        return 0.6;
                    default:
                        return 0.4;
                }
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

            // ---- custom drag with hold delay ----
            let dragState = null;

            function setupElementDrag(elDiv, el) {
                let holdTimer = null;
                let isHeld = false;
                let startX, startY;
                let hasMoved = false;

                elDiv.addEventListener('pointerdown', function(e) {
                    if (e.button !== 0) return;
                    if (e.target.closest('input') || e.target.closest('button') || e.target.closest(
                            '.btn-label') || e.target.closest('.el-text')) return;
                    const layer = getContainingLayer(el.id);
                    if (layer && layer.locked) return;

                    startX = e.clientX;
                    startY = e.clientY;
                    hasMoved = false;
                    isHeld = false;

                    holdTimer = setTimeout(() => {
                        isHeld = true;
                        // start drag
                        const rect = elDiv.getBoundingClientRect();
                        const clone = elDiv.cloneNode(true);
                        clone.style.position = 'fixed';
                        clone.style.left = rect.left + 'px';
                        clone.style.top = rect.top + 'px';
                        clone.style.width = rect.width + 'px';
                        clone.style.height = rect.height + 'px';
                        clone.style.pointerEvents = 'none';
                        clone.style.zIndex = '9999';
                        clone.style.opacity = '0.85';
                        clone.style.transform = 'scale(1.05)';
                        clone.style.boxShadow = '0 8px 32px rgba(0,0,0,0.7)';
                        clone.style.borderRadius = '4px';
                        clone.style.overflow = 'hidden';
                        document.body.appendChild(clone);

                        dragState = {
                            element: el,
                            clone: clone,
                            offsetX: e.clientX - rect.left,
                            offsetY: e.clientY - rect.top,
                            startX: e.clientX,
                            startY: e.clientY,
                            target: null,
                            position: 'inside'
                        };

                        elDiv.style.opacity = '0.3';

                        document.addEventListener('pointermove', onDragMove);
                        document.addEventListener('pointerup', onDragEnd);
                    }, 400);
                });

                elDiv.addEventListener('pointermove', function(e) {
                    if (holdTimer) {
                        const dx = e.clientX - startX;
                        const dy = e.clientY - startY;
                        if (Math.sqrt(dx * dx + dy * dy) > 8) {
                            clearTimeout(holdTimer);
                            holdTimer = null;
                            hasMoved = true;
                        }
                    }
                });

                elDiv.addEventListener('pointerup', function(e) {
                    if (holdTimer) {
                        clearTimeout(holdTimer);
                        holdTimer = null;
                    }
                });

                elDiv.addEventListener('pointercancel', function() {
                    if (holdTimer) {
                        clearTimeout(holdTimer);
                        holdTimer = null;
                    }
                });

                function onDragMove(e) {
                    if (!dragState) return;
                    e.preventDefault();

                    const x = e.clientX - dragState.offsetX;
                    const y = e.clientY - dragState.offsetY;
                    dragState.clone.style.left = x + 'px';
                    dragState.clone.style.top = y + 'px';

                    // Find drop target under cursor
                    const elUnder = document.elementFromPoint(e.clientX, e.clientY);
                    let target = null;
                    let position = 'inside';

                    if (elUnder) {
                        const targetEl = elUnder.closest(
                            '.el-box, .el-text, .el-media, .el-media-grid, .el-button-container, .el-dynamic-box, .el-col, .layer-drop-zone'
                            );
                        if (targetEl && targetEl !== elDiv) {
                            target = targetEl;
                            const rect = targetEl.getBoundingClientRect();
                            const midY = rect.top + rect.height / 2;
                            position = e.clientY < midY ? 'before' : 'after';
                        } else {
                            const layerZone = elUnder.closest('.layer-drop-zone');
                            if (layerZone && !layerZone.closest('.el-box') && !layerZone.closest('.el-col')) {
                                target = layerZone;
                                position = 'inside';
                            }
                        }
                    }

                    document.querySelectorAll('.drop-target-before, .drop-target-after, .drag-over-target').forEach(
                        el => {
                            el.classList.remove('drop-target-before', 'drop-target-after', 'drag-over-target');
                        });

                    if (target) {
                        if (position === 'before') {
                            target.classList.add('drop-target-before');
                        } else if (position === 'after') {
                            target.classList.add('drop-target-after');
                        } else {
                            target.classList.add('drag-over-target');
                            target.style.outline = '2px solid #4a8ac4';
                        }
                    }

                    dragState.target = target;
                    dragState.position = position;
                }

                function onDragEnd(e) {
                    document.removeEventListener('pointermove', onDragMove);
                    document.removeEventListener('pointerup', onDragEnd);

                    if (dragState) {
                        if (dragState.clone && dragState.clone.parentNode) {
                            dragState.clone.parentNode.removeChild(dragState.clone);
                        }
                        elDiv.style.opacity = '1';

                        document.querySelectorAll('.drop-target-before, .drop-target-after, .drag-over-target')
                            .forEach(el => {
                                el.classList.remove('drop-target-before', 'drop-target-after',
                                    'drag-over-target');
                                el.style.outline = '';
                            });

                        const target = dragState.target;
                        const position = dragState.position;
                        const draggedEl = dragState.element;

                        if (target && draggedEl) {
                            const container = getElementContainer(draggedEl.id);
                            if (!container) return;

                            let targetContainer = null;
                            let targetIdx = -1;
                            let isLayerDrop = false;

                            if (target.classList.contains('layer-drop-zone')) {
                                const layerId = parseInt(target.dataset.layerId);
                                const canvas = getParentCanvas(draggedEl.id);
                                if (canvas) {
                                    const layer = canvas.layers.find(l => l.id === layerId);
                                    if (layer && !layer.isBuffer && !layer.locked) {
                                        targetContainer = layer.elements;
                                        targetIdx = targetContainer.length;
                                        isLayerDrop = true;
                                    }
                                }
                            } else if (target.classList.contains('el-col')) {
                                const col = findElement(parseInt(target.dataset.elId));
                                if (col && col.type === 'column') {
                                    const colContainer = col.children;
                                    const idx = container.indexOf(draggedEl);
                                    if (idx !== -1) container.splice(idx, 1);
                                    colContainer.push(draggedEl);
                                    renderAll();
                                    pushHistory();
                                    selectElement(draggedEl.id);
                                    dragState = null;
                                    return;
                                }
                            } else {
                                const targetElId = parseInt(target.dataset.elId);
                                if (targetElId && targetElId !== draggedEl.id) {
                                    const targetContainer = getElementContainer(targetElId);
                                    if (targetContainer) {
                                        const tIdx = targetContainer.findIndex(e => e.id === targetElId);
                                        if (tIdx !== -1) {
                                            const idx = container.indexOf(draggedEl);
                                            if (idx !== -1) container.splice(idx, 1);
                                            const insertIdx = position === 'before' ? tIdx : tIdx + 1;
                                            if (insertIdx <= targetContainer.length) {
                                                targetContainer.splice(insertIdx, 0, draggedEl);
                                            } else {
                                                targetContainer.push(draggedEl);
                                            }
                                            renderAll();
                                            pushHistory();
                                            selectElement(draggedEl.id);
                                            dragState = null;
                                            return;
                                        }
                                    }
                                }
                            }

                            if (targetContainer && isLayerDrop) {
                                const idx = container.indexOf(draggedEl);
                                if (idx !== -1) container.splice(idx, 1);
                                targetContainer.splice(targetIdx, 0, draggedEl);
                                renderAll();
                                pushHistory();
                                selectElement(draggedEl.id);
                                dragState = null;
                                return;
                            }
                        }

                        dragState = null;
                    }
                }
            }

            // Render element
            function renderElement(el, scale) {
                const div = document.createElement('div');
                div.dataset.elId = el.id;
                div.className = 'el-' + el.type;
                if (el.type === 'button') {
                    div.className = 'el-button-container';
                }
                if (state.selectedElementId === el.id) {
                    div.classList.add('selected-element');
                }

                if (el.opacity !== undefined) {
                    div.style.opacity = el.opacity / 100;
                }

                const applyMarginPadding = (el, div) => {
                    let margin = el.margin !== undefined ? el.margin : 0;
                    let padding = el.padding !== undefined ? el.padding : 0;
                    if (el.customMargin) {
                        const t = (el.marginTop || 0) * scale;
                        const r = (el.marginRight || 0) * scale;
                        const b = (el.marginBottom || 0) * scale;
                        const l = (el.marginLeft || 0) * scale;
                        div.style.margin = `${t}px ${r}px ${b}px ${l}px`;
                    } else {
                        div.style.margin = (margin * scale) + 'px';
                    }
                    if (el.customPadding) {
                        const t = (el.paddingTop || 0) * scale;
                        const r = (el.paddingRight || 0) * scale;
                        const b = (el.paddingBottom || 0) * scale;
                        const l = (el.paddingLeft || 0) * scale;
                        div.style.padding = `${t}px ${r}px ${b}px ${l}px`;
                    } else {
                        div.style.padding = (padding * scale) + 'px';
                    }
                };
                applyMarginPadding(el, div);

                const s = el.styles || {};
                for (const [k, v] of Object.entries(s)) {
                    if (v !== undefined && v !== null && v !== '') {
                        div.style[k] = v;
                    }
                }

                const parent = getParentElement(el.id);
                const isInsideColumn = parent && parent.type === 'column';
                const anchor = (isInsideColumn && el.anchor) ? el.anchor : 'tl';
                const anchorStyles = getAnchorStyles(anchor);

                switch (el.type) {
                    case 'box': {
                        const border = (el.borderSize || 0) * scale;
                        const borderOpacity = el.borderOpacity !== undefined ? el.borderOpacity / 100 : 1;
                        let borderColor = el.borderColor || 'transparent';
                        if (borderColor !== 'transparent' && borderOpacity < 1) {
                            const temp = document.createElement('div');
                            temp.style.color = borderColor;
                            const computed = temp.style.color;
                            if (computed && computed.startsWith('rgb')) {
                                const rgb = computed.match(/\d+/g);
                                if (rgb) {
                                    borderColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${borderOpacity})`;
                                }
                            } else if (borderColor.startsWith('#')) {
                                const r = parseInt(borderColor.slice(1, 3), 16);
                                const g = parseInt(borderColor.slice(3, 5), 16);
                                const b = parseInt(borderColor.slice(5, 7), 16);
                                if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                                    borderColor = `rgba(${r},${g},${b},${borderOpacity})`;
                                }
                            }
                        }
                        div.style.background = el.bgColor || 'transparent';
                        div.style.border = border + 'px ' + (el.borderStyle || 'solid') + ' ' + borderColor;
                        div.style.borderRadius = (3 * scale) + 'px';

                        const rows = el.gridRows || 1;
                        const cols = el.gridCols || 1;

                        const gridContainer = document.createElement('div');
                        gridContainer.style.display = 'flex';
                        gridContainer.style.flexDirection = 'column';
                        gridContainer.style.gap = (4 * scale) + 'px';
                        gridContainer.style.width = '100%';
                        gridContainer.style.height = '100%';
                        gridContainer.style.minHeight = '20px';

                        const children = el.children || [];
                        const rowProportions = el.rowProportions || [];

                        for (let r = 0; r < rows; r++) {
                            const rowDiv = document.createElement('div');
                            rowDiv.style.display = 'flex';
                            rowDiv.style.gap = (4 * scale) + 'px';
                            rowDiv.style.width = '100%';
                            rowDiv.style.flex = '1 1 auto';
                            rowDiv.style.minHeight = '20px';

                            const rowProps = (rowProportions && rowProportions[r]) ?
                                rowProportions[r] :
                                Array(cols).fill(100 / cols);

                            for (let c = 0; c < cols; c++) {
                                const colIdx = r * cols + c;
                                const col = children[colIdx] || {
                                    id: uid(),
                                    type: 'column',
                                    children: [],
                                    padding: el.padding || 0,
                                    bgColor: 'transparent',
                                    customPadding: el.customPadding || false,
                                    paddingTop: el.paddingTop || 0,
                                    paddingRight: el.paddingRight || 0,
                                    paddingBottom: el.paddingBottom || 0,
                                    paddingLeft: el.paddingLeft || 0,
                                };

                                const colDiv = document.createElement('div');
                                colDiv.className = 'el-col';
                                if (state.selectedElementId === col.id) {
                                    colDiv.classList.add('selected-col');
                                }
                                colDiv.dataset.elId = col.id;
                                colDiv.style.display = 'flex';
                                colDiv.style.flexDirection = 'column';

                                if (el.useProportions && rowProps && rowProps[c] !== undefined) {
                                    const pct = rowProps[c];
                                    colDiv.style.width = pct + '%';
                                    colDiv.style.flex = '0 0 ' + pct + '%';
                                } else {
                                    colDiv.style.flex = '1 1 0';
                                    colDiv.style.width = 'auto';
                                }

                                applyMarginPadding(col, colDiv);
                                colDiv.style.background = col.bgColor || 'transparent';
                                colDiv.style.padding = (col.padding || 0) * scale + 'px';
                                colDiv.style.boxSizing = 'border-box';
                                colDiv.style.minHeight = '20px';
                                colDiv.style.position = 'relative';

                                for (const child of (col.children || [])) {
                                    const node = renderElement(child, scale);
                                    if (node) colDiv.appendChild(node);
                                }

                                colDiv.addEventListener('dragover', (e) => {
                                    e.preventDefault();
                                    colDiv.style.outline = '1px solid #4a8ac4';
                                });
                                colDiv.addEventListener('dragleave', () => {
                                    colDiv.style.outline = 'none';
                                });
                                colDiv.addEventListener('drop', (e) => {
                                    e.preventDefault();
                                    colDiv.style.outline = 'none';
                                    e.stopPropagation();
                                    const boxLayer = getContainingLayer(el.id);
                                    if (!boxLayer) return;
                                    if (boxLayer.locked) return;
                                    const data = e.dataTransfer.getData('text/plain');
                                    if (!data) return;
                                    if (data.startsWith('el:')) {
                                        const elId = parseInt(data.substring(3));
                                        const movingEl = findElement(elId);
                                        if (!movingEl) return;
                                        const oldContainer = getElementContainer(elId);
                                        if (!oldContainer) return;
                                        const idx = oldContainer.findIndex(e => e.id === elId);
                                        if (idx !== -1) {
                                            oldContainer.splice(idx, 1);
                                        }
                                        col.children.push(movingEl);
                                        renderAll();
                                        pushHistory();
                                        selectElement(movingEl.id);
                                    } else if (data.startsWith('asset:')) {
                                        const assetId = parseInt(data.substring(6));
                                        const newEl = createElement('media');
                                        handleAssetDrop(newEl, assetId);
                                        col.children.push(newEl);
                                        renderAll();
                                        pushHistory();
                                        selectElement(newEl.id);
                                    } else {
                                        const type = data;
                                        const newEl = createElement(type);
                                        col.children.push(newEl);
                                        renderAll();
                                        pushHistory();
                                        selectElement(newEl.id);
                                    }
                                });

                                rowDiv.appendChild(colDiv);
                            }

                            gridContainer.appendChild(rowDiv);
                        }

                        div.appendChild(gridContainer);
                        break;
                    }
                    case 'dynamic-box': {
                        const pad = 6 * scale;
                        div.style.padding = (el.customPadding ? el.paddingTop || 0 : el.padding || 0) * scale + 'px';
                        div.style.background = '#1a2a2a';
                        div.style.border = (1 * scale) + 'px dashed #3a5a5a';
                        div.style.borderRadius = (3 * scale) + 'px';
                        const label = document.createElement('div');
                        label.className = 'db-label';
                        label.style.fontSize = (10 * scale) + 'px';
                        label.style.color = '#5a8a8a';
                        label.style.marginBottom = (4 * scale) + 'px';
                        label.textContent = 'Dynamic: ' + (el.id || '');
                        div.appendChild(label);
                        if (el.defaultPackage) {
                            const pkg = state.packages.find(p => p.id === el.defaultPackage);
                            if (pkg) {
                                const pkgDiv = document.createElement('div');
                                const pPad = 4 * scale;
                                pkgDiv.style.padding = pPad + 'px';
                                pkgDiv.style.background = '#1e2e2e';
                                pkgDiv.style.borderRadius = (2 * scale) + 'px';
                                pkgDiv.style.marginTop = (4 * scale) + 'px';
                                pkgDiv.style.fontSize = (11 * scale) + 'px';
                                pkgDiv.textContent = 'Package: ' + pkg.name;
                                div.appendChild(pkgDiv);
                            }
                        }
                        div.addEventListener('dragover', (e) => { e.preventDefault();
                            div.style.borderColor = '#4a8ac4'; });
                        div.addEventListener('dragleave', () => { div.style.borderColor = '#3a5a5a'; });
                        div.addEventListener('drop', (e) => {
                            e.preventDefault();
                            div.style.borderColor = '#3a5a5a';
                            const data = e.dataTransfer.getData('application/json');
                            if (data) {
                                try {
                                    const parsed = JSON.parse(data);
                                    if (parsed.type === 'package') {
                                        el.defaultPackage = parsed.id;
                                        renderAll();
                                        pushHistory();
                                    }
                                } catch (_) {}
                            }
                        });
                        break;
                    }
                    case 'text': {
                        const wrap = document.createElement('div');
                        wrap.style.display = 'flex';
                        wrap.style.width = '100%';
                        wrap.style.height = '100%';
                        if (isInsideColumn) {
                            wrap.style.justifyContent = anchorStyles.justifyContent;
                            wrap.style.alignItems = anchorStyles.alignItems;
                        } else {
                            wrap.style.justifyContent = 'flex-start';
                            wrap.style.alignItems = 'flex-start';
                        }

                        const textDiv = document.createElement('div');
                        textDiv.textContent = el.content || 'Text';
                        const fs = (el.fontSize || 16) * scale;
                        const ls = (el.letterSpacing || 0) * scale;
                        textDiv.style.fontFamily = el.fontFamily || 'Inter';
                        textDiv.style.fontSize = fs + 'px';
                        textDiv.style.color = el.color || '#e0e0e0';
                        textDiv.style.fontWeight = el.fontWeight || '400';
                        textDiv.style.fontStyle = el.fontStyle || 'normal';
                        textDiv.style.textDecoration = el.textDecoration || 'none';
                        textDiv.style.textAlign = el.textAlign || 'left';
                        textDiv.style.letterSpacing = ls + 'px';
                        textDiv.style.lineHeight = el.lineHeight || 1.5;
                        if (el.highlight) {
                            textDiv.style.background = el.highlight;
                            textDiv.style.padding = '0 ' + (4 * scale) + 'px';
                            textDiv.style.borderRadius = (2 * scale) + 'px';
                        }
                        textDiv.style.padding = (el.customPadding ? el.paddingTop || 0 : el.padding || 0) * scale +
                            'px ' + (4 * scale) + 'px';
                        textDiv.contentEditable = true;
                        textDiv.className = 'el-text';
                        textDiv.addEventListener('input', () => {
                            el.content = textDiv.textContent || '';
                        });
                        textDiv.addEventListener('blur', () => { pushHistory(); });
                        textDiv.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (!textDiv.dataset.selectionHandled) {
                                selectElement(el.id);
                            }
                            textDiv.dataset.selectionHandled = 'true';
                            setTimeout(() => { delete textDiv.dataset.selectionHandled; }, 100);
                            if (document.activeElement !== textDiv) {
                                textDiv.focus();
                                const range = document.createRange();
                                range.selectNodeContents(textDiv);
                                range.collapse(false);
                                const sel = window.getSelection();
                                sel.removeAllRanges();
                                sel.addRange(range);
                            }
                        });

                        wrap.appendChild(textDiv);
                        div.appendChild(wrap);
                        break;
                    }
                    case 'media': {
                        const wrap = document.createElement('div');
                        wrap.className = 'media-align-wrap';
                        wrap.style.display = 'flex';
                        wrap.style.width = '100%';
                        wrap.style.height = '100%';
                        if (isInsideColumn) {
                            wrap.style.justifyContent = anchorStyles.justifyContent;
                            wrap.style.alignItems = anchorStyles.alignItems;
                        } else {
                            wrap.style.justifyContent = 'flex-start';
                            wrap.style.alignItems = 'flex-start';
                        }

                        const mediaType = el.mediaType || 'image';
                        let element;
                        if (mediaType === 'video') {
                            const video = document.createElement('video');
                            video.src = el.src || '';
                            video.poster = el.poster || '';
                            if (el.autoplay) video.autoplay = true;
                            if (el.loop) video.loop = true;
                            if (el.controls !== false) video.controls = true;
                            video.style.display = 'block';
                            element = video;
                        } else {
                            const img = document.createElement('img');
                            img.src = el.src || '';
                            img.alt = el.alt || '';
                            img.style.display = 'block';
                            element = img;
                        }

                        const sizeAdj = el.sizeAdjust || 0;
                        const scaleFactor = 1 + (sizeAdj / 100);
                        element.style.transform = `scale(${scaleFactor})`;
                        element.style.transformOrigin = 'center center';

                        if (el.width && el.width !== '') {
                            element.style.width = el.width;
                        } else {
                            element.style.width = 'auto';
                            element.style.maxWidth = '100%';
                        }
                        if (el.height && el.height !== '') {
                            element.style.height = el.height;
                        } else {
                            element.style.height = 'auto';
                        }

                        let radius = 0;
                        if (el.useIndividualRadius) {
                            const tl = (el.cornerRadiusTL || 0) * scale;
                            const tr = (el.cornerRadiusTR || 0) * scale;
                            const br = (el.cornerRadiusBR || 0) * scale;
                            const bl = (el.cornerRadiusBL || 0) * scale;
                            element.style.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`;
                        } else {
                            radius = (el.cornerRadius || 0) * scale;
                            element.style.borderRadius = radius + 'px';
                        }
                        if (el.shape === 'circle') {
                            element.style.borderRadius = '50%';
                        } else if (el.shape === 'diamond') {
                            element.style.clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
                        }
                        const cropTop = el.cropTop || 0;
                        const cropRight = el.cropRight || 0;
                        const cropBottom = el.cropBottom || 0;
                        const cropLeft = el.cropLeft || 0;
                        if (cropTop || cropRight || cropBottom || cropLeft) {
                            element.style.clipPath = `inset(${cropTop}% ${cropRight}% ${cropBottom}% ${cropLeft}%)`;
                        }
                        if (el.fit === 'crop') {
                            element.style.objectFit = 'cover';
                            element.style.width = '100%';
                            element.style.height = '100%';
                        } else {
                            element.style.objectFit = 'contain';
                        }

                        wrap.appendChild(element);
                        div.appendChild(wrap);
                        break;
                    }
                    case 'media-grid': {
                        const grid = document.createElement('div');
                        grid.className = 'el-media-grid' + (el.layout === 'masonry' ? ' masonry' : '');
                        if (el.layout !== 'masonry') {
                            const cols = el.gridCols || 3;
                            grid.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
                            const gap = 4 * scale;
                            grid.style.gap = gap + 'px';
                        }
                        const items = el.items || [];
                        const marg = (el.margin || 0) * scale;
                        const radius = (el.cornerRadius || 0) * scale;
                        const fit = el.fit || 'fit';
                        for (const item of items) {
                            const mediaDiv = document.createElement('div');
                            mediaDiv.className = 'media-item' + (fit === 'crop' ? ' crop' : ' fit');
                            mediaDiv.style.margin = marg + 'px';
                            mediaDiv.style.borderRadius = radius + 'px';
                            mediaDiv.style.overflow = 'hidden';
                            let mediaEl;
                            if (item.mediaType === 'video') {
                                const video = document.createElement('video');
                                video.src = item.src || '';
                                video.poster = item.poster || '';
                                video.controls = true;
                                video.style.width = '100%';
                                video.style.display = 'block';
                                if (fit === 'crop') {
                                    video.style.objectFit = 'cover';
                                    const h = 120 * scale;
                                    video.style.height = h + 'px';
                                } else {
                                    video.style.objectFit = 'contain';
                                }
                                mediaEl = video;
                            } else {
                                const img = document.createElement('img');
                                img.src = item.src || '';
                                img.alt = item.alt || '';
                                img.style.width = '100%';
                                img.style.display = 'block';
                                if (fit === 'crop') {
                                    img.style.objectFit = 'cover';
                                    const h = 120 * scale;
                                    img.style.height = h + 'px';
                                } else {
                                    img.style.objectFit = 'contain';
                                }
                                mediaEl = img;
                            }
                            mediaDiv.appendChild(mediaEl);
                            mediaDiv.addEventListener('click', () => {
                                if (item.mediaType !== 'video') {
                                    openLightbox(item.src || '');
                                }
                            });
                            grid.appendChild(mediaDiv);
                        }
                        div.appendChild(grid);
                        div.addEventListener('dragover', (e) => e.preventDefault());
                        div.addEventListener('drop', (e) => {
                            e.preventDefault();
                            const data = e.dataTransfer.getData('text/plain');
                            if (data && data.startsWith('asset:')) {
                                const assetId = parseInt(data.substring(6));
                                const asset = state.assets.find(a => a.id === assetId);
                                if (asset) {
                                    if (!el.items) el.items = [];
                                    el.items.push({
                                        src: asset.url,
                                        alt: asset.name,
                                        mediaType: asset.type === 'video' ? 'video' : 'image',
                                        poster: '',
                                        assetId: asset.id,
                                    });
                                    renderAll();
                                    pushHistory();
                                }
                            } else {
                                const files = e.dataTransfer.files;
                                for (const file of files) {
                                    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
                                        const reader = new FileReader();
                                        reader.onload = (ev) => {
                                            const mediaType = file.type.startsWith('video/') ? 'video' :
                                                'image';
                                            if (!el.items) el.items = [];
                                            const blob = dataURLToBlob(ev.target.result);
                                            const url = URL.createObjectURL(blob);
                                            el.items.push({
                                                src: url,
                                                alt: file.name,
                                                mediaType: mediaType,
                                                poster: '',
                                                assetId: null,
                                            });
                                            renderAll();
                                            pushHistory();
                                        };
                                        reader.readAsDataURL(file);
                                    }
                                }
                            }
                        });
                        break;
                    }
                    case 'button': {
                        const wrap = document.createElement('div');
                        wrap.style.display = 'flex';
                        wrap.style.width = '100%';
                        wrap.style.height = '100%';
                        if (isInsideColumn) {
                            wrap.style.justifyContent = anchorStyles.justifyContent;
                            wrap.style.alignItems = anchorStyles.alignItems;
                        } else {
                            wrap.style.justifyContent = 'flex-start';
                            wrap.style.alignItems = 'flex-start';
                        }

                        const btn = document.createElement('button');
                        btn.className = 'el-button';
                        btn.style.position = 'relative';
                        btn.style.display = 'inline-flex';
                        btn.style.flexDirection = 'column';
                        btn.style.alignItems = 'center';
                        btn.style.justifyContent = 'center';
                        btn.style.width = 'auto';
                        btn.style.height = 'auto';
                        btn.style.minHeight = '30px';
                        btn.style.minWidth = '30px';

                        const radius = (el.cornerRadius || 4) * scale;
                        const border = (el.borderSize || 0) * scale;
                        const pad = 4 * scale;
                        btn.style.borderRadius = radius + 'px';
                        btn.style.background = el.bgColor || '#2a5a8a';
                        btn.style.color = el.color || '#ffffff';
                        btn.style.border = border + 'px solid ' + (el.borderColor || 'transparent');
                        btn.style.padding = pad + 'px ' + (12 * scale) + 'px';
                        btn.style.cursor = 'pointer';
                        const fs = (el.fontSize || 13) * scale;
                        btn.style.fontSize = fs + 'px';

                        if (el.autoWidth !== false) {
                            btn.style.width = 'auto';
                        } else if (el.width && el.width !== '') {
                            btn.style.width = el.width;
                        }
                        if (el.height && el.height !== '') {
                            btn.style.height = el.height;
                        }

                        const contentContainer = document.createElement('div');
                        contentContainer.className = 'btn-content';
                        contentContainer.style.display = 'flex';
                        contentContainer.style.flexDirection = 'column';
                        contentContainer.style.alignItems = 'center';
                        contentContainer.style.justifyContent = 'center';
                        contentContainer.style.width = '100%';
                        contentContainer.style.height = '100%';
                        contentContainer.style.pointerEvents = 'none';

                        if (el.children && el.children.length > 0) {
                            for (const child of el.children) {
                                const childNode = renderElement(child, scale);
                                if (childNode) {
                                    childNode.style.pointerEvents = 'auto';
                                    contentContainer.appendChild(childNode);
                                }
                            }
                        } else {
                            const defaultLabel = document.createElement('span');
                            defaultLabel.textContent = el.label || 'Button';
                            defaultLabel.style.color = 'inherit';
                            defaultLabel.style.fontSize = 'inherit';
                            defaultLabel.style.pointerEvents = 'none';
                            contentContainer.appendChild(defaultLabel);
                        }

                        btn.appendChild(contentContainer);

                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (document.activeElement?.closest('.el-text')) return;
                            handleButtonAction(el);
                        });

                        btn.addEventListener('dblclick', (e) => {
                            const textEl = e.target.closest('.el-text');
                            if (textEl && textEl.contentEditable !== 'true') {
                                textEl.contentEditable = 'true';
                                textEl.focus();
                                const range = document.createRange();
                                range.selectNodeContents(textEl);
                                const sel = window.getSelection();
                                sel.removeAllRanges();
                                sel.addRange(range);
                            }
                        });

                        wrap.appendChild(btn);
                        div.appendChild(wrap);

                        setupElementDrag(div, el);
                        break;
                    }
                    default: {
                        div.textContent = 'Unknown: ' + el.type;
                        div.style.color = '#999';
                        div.style.fontSize = (12 * scale) + 'px';
                    }
                }

                if (el.type !== 'button' && el.type !== 'column') {
                    setupElementDrag(div, el);
                }

                div.addEventListener('click', (e) => {
                    if (e.target.closest('input') || e.target.closest('button')) return;
                    if (e.target.closest('.el-text') && e.target.closest('.el-text').contentEditable ===
                        'true') return;
                    e.stopPropagation();
                    if (!div.dataset.selectionHandled) {
                        selectElement(el.id);
                    }
                    div.dataset.selectionHandled = 'true';
                    setTimeout(() => { delete div.dataset.selectionHandled; }, 100);
                });

                div.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    selectElement(el.id);
                    showContextMenu(e.clientX, e.clientY, null, el.id);
                });

                div.addEventListener('dragover', (e) => {
                    const data = e.dataTransfer.getData('text/plain');
                    if (data && data.startsWith('asset:')) {
                        e.preventDefault();
                    }
                });
                div.addEventListener('drop', (e) => {
                    const data = e.dataTransfer.getData('text/plain');
                    if (data && data.startsWith('asset:')) {
                        e.preventDefault();
                        e.stopPropagation();
                        const assetId = parseInt(data.substring(6));
                        const asset = state.assets.find(a => a.id === assetId);
                        if (!asset) return;
                        if (el.type === 'media') {
                            el.src = asset.url;
                            el.mediaType = asset.type === 'video' ? 'video' : 'image';
                            el.assetId = asset.id;
                            renderAll();
                            pushHistory();
                        } else if (el.type === 'media-grid') {
                            if (!el.items) el.items = [];
                            el.items.push({
                                src: asset.url,
                                alt: asset.name,
                                mediaType: asset.type === 'video' ? 'video' : 'image',
                                poster: '',
                                assetId: asset.id,
                            });
                            renderAll();
                            pushHistory();
                        }
                    }
                });

                return div;
            }

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
                                        renderAll();
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

            function showPreviewCanvas(canvas) {
                const overlay = document.getElementById('preview-overlay');
                const content = document.getElementById('preview-content');
                content.innerHTML = '';
                const wrapper = document.createElement('div');
                wrapper.className = 'preview-canvas';
                const scale = Math.min(1, (window.innerWidth - 120) / canvas.width, (window.innerHeight - 120) / canvas
                    .height);
                wrapper.style.transform = 'scale(' + scale + ')';
                wrapper.style.transformOrigin = 'top left';
                wrapper.style.background = canvas.bgColor || '#ffffff';
                wrapper.style.width = canvas.width + 'px';
                wrapper.style.height = canvas.height + 'px';
                wrapper.style.overflow = 'hidden';
                wrapper.style.position = 'relative';
                for (let i = 0; i < canvas.layers.length; i++) {
                    const layer = canvas.layers[i];
                    if (layer.isBuffer && layer.elements.length === 0) continue;
                    const layerDiv = document.createElement('div');
                    layerDiv.style.position = 'absolute';
                    layerDiv.style.top = '0';
                    layerDiv.style.left = '0';
                    layerDiv.style.width = '100%';
                    layerDiv.style.height = '100%';
                    layerDiv.style.zIndex = i;
                    layerDiv.style.overflow = 'auto';
                    for (const el of layer.elements) {
                        const node = renderElement(el, 1);
                        if (node) layerDiv.appendChild(node);
                    }
                    wrapper.appendChild(layerDiv);
                }
                content.appendChild(wrapper);
                overlay.classList.add('active');
            }

            // -------- LAYERS PANEL --------
            function renderElementTree(elements, layerId, depth, parentEl) {
                let html = '';
                for (const el of elements) {
                    const isElSelected = (state.selectedElementId === el.id);
                    let displayName = el.type;
                    if (el.type === 'column') {
                        let box = parentEl;
                        while (box && box.type !== 'box') {
                            box = getParentElement(box.id);
                        }
                        if (box) {
                            const idx = box.children.indexOf(el);
                            if (idx !== -1) {
                                const cols = box.gridCols || 1;
                                const row = Math.floor(idx / cols) + 1;
                                const col = (idx % cols) + 1;
                                displayName = 'Column R' + row + 'C' + col;
                            }
                        }
                    } else if (el.type === 'button') {
                        displayName = 'Button' + (el.label ? ': ' + el.label : ' #' + el.id);
                    } else {
                        displayName = el.type + (el.type === 'text' && el.content ? ': ' + el.content.substring(0, 12) :
                            ' #' + el.id);
                    }
                    const marginLeft = depth * 16;
                    html += `
                              <div class="layer-panel-item child-item ${isElSelected ? 'selected' : ''}" 
                                   draggable="true"
                                   data-element-id="${el.id}"
                                   data-layer-id="${layerId}"
                                   data-type="element"
                                   style="margin-left:${marginLeft}px;">
                                  <span class="item-name">${displayName}</span>
                                  <span class="item-controls">
                                      <button class="btn-element-delete" data-element-id="${el.id}" title="Delete element">✕</button>
                                  </span>
                              </div>
                            `;
                    if (el.children && el.children.length > 0) {
                        html += renderElementTree(el.children, layerId, depth + 1, el);
                    }
                }
                return html;
            }

            function renderLayersPanel() {
                const canvas = state.canvases.find(c => c.id === state.selectedCanvasId);
                if (!canvas) {
                    layersList.innerHTML = '<div class="text-muted">No canvas selected</div>';
                    return;
                }

                let html = `
                              <div class="layer-panel-header">
                                  <span style="font-size:12px;color:#888;">Layers</span>
                                  <button id="btn-add-layer">+ Add Layer</button>
                              </div>
                              <div id="layer-items-container">
                            `;

                const displayLayers = canvas.layers.filter(l => !l.isBuffer);
                for (let i = 0; i < displayLayers.length; i++) {
                    const layer = displayLayers[i];
                    const isSelected = (canvas.selectedLayerId === layer.id);
                    const locked = layer.locked || false;
                    html += `
                                  <div class="layer-panel-item parent-item ${isSelected ? 'selected' : ''}" 
                                       draggable="true" 
                                       data-layer-id="${layer.id}"
                                       data-layer-index="${i}"
                                       data-type="layer">
                                      <span class="item-name">${layer.name}</span>
                                      <span class="item-controls">
                                          <button class="lock-btn ${locked ? 'locked' : ''}" data-layer-id="${layer.id}" title="Toggle lock">${locked ? '🔒' : '🔓'}</button>
                                          <button class="btn-layer-delete" data-layer-id="${layer.id}" title="Delete layer">✕</button>
                                      </span>
                                  </div>
                              `;
                    html += renderElementTree(layer.elements, layer.id, 1, null);
                }

                const buffer = canvas.layers.find(l => l.isBuffer);
                if (buffer) {
                    html += `
                                  <div class="layer-panel-item buffer-item" style="cursor:default;">
                                      <span class="item-name">Buffer (page overlay - locked)</span>
                                      <span class="item-controls">
                                          <button class="btn-clear-buffer" title="Clear buffer">✕</button>
                                      </span>
                                  </div>
                              `;
                }

                html += `</div>`;
                layersList.innerHTML = html;

                document.querySelectorAll('.layer-panel-item .item-name').forEach(nameSpan => {
                    nameSpan.addEventListener('dblclick', function(e) {
                        e.stopPropagation();
                        const item = this.closest('.layer-panel-item');
                        if (!item) return;
                        const currentName = this.textContent;
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.value = currentName;
                        input.style.background = '#111';
                        input.style.border = '1px solid #4a8ac4';
                        input.style.color = '#fff';
                        input.style.padding = '0 4px';
                        input.style.fontSize = '12px';
                        input.style.width = '100%';
                        this.innerHTML = '';
                        this.appendChild(input);
                        input.focus();
                        input.select();

                        const finishRename = () => {
                            const newName = input.value.trim() || currentName;
                            const type = item.dataset.type;
                            if (type === 'layer') {
                                const layerId = parseInt(item.dataset.layerId);
                                const layer = canvas.layers.find(l => l.id === layerId);
                                if (layer) {
                                    layer.name = newName;
                                    renderLayersPanel();
                                    pushHistory();
                                }
                            } else if (type === 'element') {
                                const elId = parseInt(item.dataset.elementId);
                                const el = findElement(elId);
                                if (el) {
                                    el.customName = newName;
                                    renderLayersPanel();
                                    pushHistory();
                                }
                            }
                        };

                        input.addEventListener('blur', finishRename);
                        input.addEventListener('keydown', (ev) => {
                            if (ev.key === 'Enter') {
                                ev.preventDefault();
                                input.blur();
                            }
                            if (ev.key === 'Escape') {
                                input.value = currentName;
                                input.blur();
                            }
                        });
                    });
                });

                const addBtn = document.getElementById('btn-add-layer');
                if (addBtn) {
                    addBtn.addEventListener('click', () => {
                        const name = prompt('Enter layer name:', 'Layer ' + (canvas.layers.filter(l => !l
                            .isBuffer)
                            .length + 1));
                        if (name) {
                            const newLayer = { id: uid(), name: name, elements: [], locked: false };
                            const bufferIndex = canvas.layers.findIndex(l => l.isBuffer);
                            if (bufferIndex !== -1) {
                                canvas.layers.splice(bufferIndex, 0, newLayer);
                            } else {
                                canvas.layers.push(newLayer);
                            }
                            canvas.selectedLayerId = newLayer.id;
                            renderAll();
                            pushHistory();
                        }
                    });
                }

                document.querySelectorAll('.lock-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const layerId = parseInt(btn.dataset.layerId);
                        const layer = canvas.layers.find(l => l.id === layerId);
                        if (layer) {
                            layer.locked = !layer.locked;
                            renderAll();
                            pushHistory();
                        }
                    });
                });

                document.querySelectorAll('.btn-layer-delete').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const layerId = parseInt(btn.dataset.layerId);
                        const nonBuffer = canvas.layers.filter(l => !l.isBuffer);
                        if (nonBuffer.length <= 1) {
                            return;
                        }
                        const layer = canvas.layers.find(l => l.id === layerId);
                        if (layer && !layer.isBuffer) {
                            canvas.layers = canvas.layers.filter(l => l.id !== layerId);
                            if (canvas.selectedLayerId === layerId) {
                                canvas.selectedLayerId = nonBuffer[0].id;
                            }
                            renderAll();
                            pushHistory();
                        }
                    });
                });

                const clearBtn = document.querySelector('.btn-clear-buffer');
                if (clearBtn) {
                    clearBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const buffer = canvas.layers.find(l => l.isBuffer);
                        if (buffer) {
                            buffer.elements = [];
                            renderAll();
                            pushHistory();
                        }
                    });
                }

                document.querySelectorAll('.btn-element-delete').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const elId = parseInt(btn.dataset.elementId);
                        removeElement(elId);
                        renderAll();
                        pushHistory();
                    });
                });

                const items = document.querySelectorAll('.layer-panel-item:not(.buffer-item)');
                items.forEach(item => {
                    item.addEventListener('dragstart', (e) => {
                        item.classList.add('dragging');
                        const type = item.dataset.type;
                        const id = type === 'layer' ? item.dataset.layerId : item.dataset.elementId;
                        e.dataTransfer.setData('text/plain', type + ':' + id);
                        e.dataTransfer.effectAllowed = 'move';
                    });
                    item.addEventListener('dragend', () => {
                        item.classList.remove('dragging');
                        items.forEach(el => el.classList.remove('drag-over'));
                    });
                    item.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        item.classList.add('drag-over');
                    });
                    item.addEventListener('dragleave', () => {
                        item.classList.remove('drag-over');
                    });
                    item.addEventListener('drop', (e) => {
                        e.preventDefault();
                        item.classList.remove('drag-over');
                        const data = e.dataTransfer.getData('text/plain');
                        if (!data) return;
                        const [type, id] = data.split(':');
                        const targetType = item.dataset.type;
                        const targetId = targetType === 'layer' ? parseInt(item.dataset.layerId) : parseInt(item
                            .dataset.elementId);

                        if (type === 'layer') {
                            const layerId = parseInt(id);
                            if (targetType === 'layer') {
                                const fromIndex = canvas.layers.findIndex(l => l.id === layerId);
                                const toIndex = canvas.layers.findIndex(l => l.id === targetId);
                                if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
                                    const [removed] = canvas.layers.splice(fromIndex, 1);
                                    canvas.layers.splice(toIndex, 0, removed);
                                    renderAll();
                                    pushHistory();
                                }
                            }
                        } else if (type === 'element') {
                            const elId = parseInt(id);
                            const el = findElement(elId);
                            if (!el) return;
                            const sourceLayer = getContainingLayer(elId);
                            if (!sourceLayer) return;
                            if (targetType === 'layer') {
                                const targetLayer = canvas.layers.find(l => l.id === targetId);
                                if (!targetLayer || targetLayer.isBuffer || targetLayer.locked) return;
                                const srcIdx = sourceLayer.elements.findIndex(e => e.id === elId);
                                if (srcIdx !== -1) {
                                    sourceLayer.elements.splice(srcIdx, 1);
                                }
                                targetLayer.elements.push(el);
                                renderAll();
                                pushHistory();
                                selectElement(el.id);
                            } else if (targetType === 'element') {
                                const targetElId = targetId;
                                const targetLayer = getContainingLayer(targetElId);
                                if (!targetLayer || targetLayer.isBuffer || targetLayer.locked) return;
                                const fromIdx = sourceLayer.elements.findIndex(e => e.id === elId);
                                if (fromIdx === -1) return;
                                const toIdx = targetLayer.elements.findIndex(e => e.id === targetElId);
                                if (toIdx === -1) return;
                                const [movedEl] = sourceLayer.elements.splice(fromIdx, 1);
                                if (sourceLayer === targetLayer) {
                                    const adjusted = fromIdx < toIdx ? toIdx - 1 : toIdx;
                                    targetLayer.elements.splice(adjusted, 0, movedEl);
                                } else {
                                    targetLayer.elements.splice(toIdx, 0, movedEl);
                                }
                                renderAll();
                                pushHistory();
                                selectElement(movedEl.id);
                            }
                        }
                    });
                });

                items.forEach(item => {
                    item.addEventListener('click', () => {
                        if (item.dataset.type === 'layer') {
                            const layerId = parseInt(item.dataset.layerId);
                            canvas.selectedLayerId = layerId;
                            renderAll();
                        } else if (item.dataset.type === 'element') {
                            const elId = parseInt(item.dataset.elementId);
                            selectElement(elId);
                        }
                    });
                });
            }

            // -------- PACKAGES --------
            function renderPackages() {
                packagesList.innerHTML = '';
                if (state.packages.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'text-muted';
                    empty.textContent = 'No packages yet';
                    packagesList.appendChild(empty);
                    return;
                }
                for (const pkg of state.packages) {
                    const item = document.createElement('div');
                    item.className = 'package-item';
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'pname';
                    nameSpan.textContent = pkg.name || 'Package #' + pkg.id;
                    item.appendChild(nameSpan);
                    const controls = document.createElement('span');
                    controls.className = 'pcontrols';
                    const delBtn = document.createElement('button');
                    delBtn.textContent = '✕';
                    delBtn.style.color = '#aa4444';
                    delBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        state.packages = state.packages.filter(p => p.id !== pkg.id);
                        renderPackages();
                        pushHistory();
                    });
                    controls.appendChild(delBtn);
                    item.appendChild(controls);
                    item.draggable = true;
                    item.addEventListener('dragstart', (e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'package',
                            id: pkg.id }));
                        e.dataTransfer.effectAllowed = 'move';
                    });
                    item.addEventListener('click', () => {
                        alert('Package: ' + pkg.name + ' (elements: ' + pkg.elements.length + ')');
                    });
                    packagesList.appendChild(item);
                }
            }

            // -------- PROPERTIES --------
            function addScrubber(input, onChange) {
                let isScrubbing = false;
                let startX, startVal, timer;
                let isHeld = false;
                input.classList.add('scrub');
                input.addEventListener('mousedown', (e) => {
                    if (e.button !== 0) return;
                    if (document.activeElement === input) return;
                    e.preventDefault();
                    startX = e.clientX;
                    startVal = parseFloat(input.value) || 0;
                    isHeld = false;
                    timer = setTimeout(() => {
                        isHeld = true;
                        isScrubbing = true;
                    }, 300);
                    const onMove = (ev) => {
                        if (!isScrubbing) {
                            if (timer) {
                                clearTimeout(timer);
                                timer = null;
                            }
                            return;
                        }
                        const delta = (ev.clientX - startX) * 0.5;
                        let newVal = startVal + delta;
                        const step = parseFloat(input.step) || 1;
                        newVal = Math.round(newVal / step) * step;
                        const min = parseFloat(input.min) || -Infinity;
                        const max = parseFloat(input.max) || Infinity;
                        newVal = Math.min(max, Math.max(min, newVal));
                        input.value = newVal;
                        if (onChange) onChange(newVal);
                    };
                    const onUp = () => {
                        clearTimeout(timer);
                        timer = null;
                        isScrubbing = false;
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        if (!isHeld && Math.abs(e.clientX - startX) < 3) {
                            input.focus();
                            input.select();
                        } else {
                            if (onChange) onChange(parseFloat(input.value) || 0);
                        }
                    };
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                });
            }

            function renderAnchorPicker(el) {
                const parent = getParentElement(el.id);
                const isInsideColumn = parent && parent.type === 'column';
                if (!isInsideColumn) return null;

                const container = document.createElement('div');
                container.className = 'prop-group';
                const label = document.createElement('label');
                label.textContent = 'Position Anchor';
                container.appendChild(label);

                const grid = document.createElement('div');
                grid.className = 'anchor-picker';

                const positions = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
                const labels = ['↖', '↑', '↗', '←', '⊙', '→', '↙', '↓', '↘'];

                const currentAnchor = el.anchor || 'tl';

                positions.forEach((pos, index) => {
                    const cell = document.createElement('div');
                    cell.className = 'cell' + (currentAnchor === pos ? ' active' : '');
                    cell.dataset.value = pos;
                    cell.textContent = labels[index];
                    cell.style.display = 'flex';
                    cell.style.alignItems = 'center';
                    cell.style.justifyContent = 'center';
                    cell.style.fontSize = '12px';
                    cell.style.color = '#888';
                    cell.addEventListener('click', () => {
                        el.anchor = pos;
                        renderAll();
                        pushHistory();
                    });
                    grid.appendChild(cell);
                });

                container.appendChild(grid);
                return container;
            }

            function renderSizeAdjust(el) {
                const group = document.createElement('div');
                group.className = 'prop-group';
                const label = document.createElement('label');
                label.textContent = 'Size Adjustment';
                group.appendChild(label);

                const wrap = document.createElement('div');
                wrap.className = 'size-slider-wrap';

                const input = document.createElement('input');
                input.type = 'range';
                input.min = -50;
                input.max = 100;
                input.value = el.sizeAdjust || 0;

                const textInput = document.createElement('input');
                textInput.type = 'number';
                textInput.value = el.sizeAdjust || 0;
                textInput.min = -50;
                textInput.max = 100;
                textInput.style.width = '50px';

                const valDisplay = document.createElement('span');
                valDisplay.className = 'size-val';
                valDisplay.textContent = (el.sizeAdjust || 0) + '%';

                const updateValue = (val) => {
                    val = Math.min(100, Math.max(-50, val));
                    el.sizeAdjust = val;
                    input.value = val;
                    textInput.value = val;
                    valDisplay.textContent = val + '%';
                    renderAll();
                    pushHistory();
                };

                input.addEventListener('input', () => {
                    const val = parseInt(input.value) || 0;
                    updateValue(val);
                });

                textInput.addEventListener('change', () => {
                    const val = parseInt(textInput.value) || 0;
                    updateValue(val);
                });

                textInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = parseInt(textInput.value) || 0;
                        updateValue(val);
                    }
                });

                wrap.appendChild(input);
                wrap.appendChild(textInput);
                wrap.appendChild(valDisplay);
                group.appendChild(wrap);

                return group;
            }

            function renderProperties() {
                const el = state.selectedElementId ? findElement(state.selectedElementId) : null;
                if (!el) {
                    propertiesContent.innerHTML = '<div class="text-muted">Select an element to edit</div>';
                    return;
                }
                propertiesContent.innerHTML = '';
                const typeLabel = document.createElement('div');
                typeLabel.style.fontSize = '13px';
                typeLabel.style.fontWeight = '500';
                typeLabel.style.marginBottom = '8px';
                typeLabel.textContent = el.type.toUpperCase() + ' #' + el.id;
                propertiesContent.appendChild(typeLabel);

                const renderProp = (label, key, type, options = null) => {
                    const group = document.createElement('div');
                    group.className = 'prop-group';
                    const lbl = document.createElement('label');
                    lbl.textContent = label;
                    group.appendChild(lbl);
                    const row = document.createElement('div');
                    row.className = 'prop-row';
                    let input;
                    if (type === 'color') {
                        input = document.createElement('input');
                        input.type = 'color';
                        input.value = el[key] || '#000000';
                        input.addEventListener('input', (e) => {
                            el[key] = e.target.value;
                            renderCanvases();
                        });
                        input.addEventListener('change', () => { pushHistory(); });
                    } else if (type === 'select' && options) {
                        input = document.createElement('select');
                        for (const opt of options) {
                            const o = document.createElement('option');
                            o.value = opt;
                            o.textContent = opt;
                            if (el[key] === opt) o.selected = true;
                            input.appendChild(o);
                        }
                        input.addEventListener('change', () => {
                            el[key] = input.value;
                            if (el.type === 'box' && (key === 'gridRows' || key === 'gridCols')) {
                                updateBoxColumns(el);
                                renderAll();
                                pushHistory();
                            } else {
                                renderAll();
                                pushHistory();
                            }
                        });
                    } else if (type === 'number') {
                        input = document.createElement('input');
                        input.type = 'number';
                        input.value = el[key] || 0;
                        input.step = '1';
                        if (key === 'opacity' || key === 'borderOpacity') {
                            input.min = 0;
                            input.max = 100;
                        }
                        const onChange = (val) => {
                            el[key] = val;
                            if (el.type === 'box' && (key === 'gridRows' || key === 'gridCols')) {
                                updateBoxColumns(el);
                            }
                            renderAll();
                            pushHistory();
                        };
                        input.addEventListener('change', () => {
                            const val = parseFloat(input.value) || 0;
                            onChange(val);
                        });
                        addScrubber(input, onChange);
                    } else if (type === 'text') {
                        input = document.createElement('input');
                        input.type = 'text';
                        input.value = el[key] || '';
                        input.style.width = '100%';
                        input.addEventListener('change', () => { el[key] = input.value;
                            renderAll();
                            pushHistory(); });
                    } else if (type === 'textarea') {
                        input = document.createElement('textarea');
                        input.value = el[key] || '';
                        input.style.width = '100%';
                        input.style.background = '#111';
                        input.style.border = '1px solid #333';
                        input.style.color = '#ddd';
                        input.style.borderRadius = '3px';
                        input.style.padding = '4px';
                        input.style.fontSize = '11px';
                        input.rows = 2;
                        input.addEventListener('change', () => { el[key] = input.value;
                            renderAll();
                            pushHistory(); });
                    } else if (type === 'checkbox') {
                        input = document.createElement('input');
                        input.type = 'checkbox';
                        input.checked = el[key] || false;
                        input.addEventListener('change', () => {
                            el[key] = input.checked;
                            renderAll();
                            pushHistory();
                        });
                    }
                    if (input) {
                        row.appendChild(input);
                        group.appendChild(row);
                    }
                    return group;
                };

                const renderMarginPadding = (labelPrefix, keyPrefix) => {
                    const isMargin = keyPrefix === 'margin';
                    const group = document.createElement('div');
                    group.className = 'prop-group';
                    const lbl = document.createElement('label');
                    lbl.textContent = labelPrefix;
                    group.appendChild(lbl);
                    const row = document.createElement('div');
                    row.className = 'prop-row';

                    const customKey = isMargin ? 'customMargin' : 'customPadding';
                    const customCheck = document.createElement('input');
                    customCheck.type = 'checkbox';
                    customCheck.checked = el[customKey] || false;
                    customCheck.title = 'Enable individual sides';
                    customCheck.addEventListener('change', () => {
                        el[customKey] = customCheck.checked;
                        renderProperties();
                        renderCanvases();
                        pushHistory();
                    });
                    const customLabel = document.createElement('span');
                    customLabel.textContent = 'Custom';
                    customLabel.style.fontSize = '10px';
                    customLabel.style.color = '#888';
                    const wrapper = document.createElement('span');
                    wrapper.style.display = 'flex';
                    wrapper.style.alignItems = 'center';
                    wrapper.style.gap = '4px';
                    wrapper.appendChild(customCheck);
                    wrapper.appendChild(customLabel);
                    row.appendChild(wrapper);

                    if (!el[customKey]) {
                        const input = document.createElement('input');
                        input.type = 'number';
                        input.value = el[keyPrefix] || 0;
                        input.step = '1';
                        const onChange = (val) => {
                            el[keyPrefix] = val;
                            renderAll();
                            pushHistory();
                        };
                        input.addEventListener('change', () => {
                            onChange(parseFloat(input.value) || 0);
                        });
                        addScrubber(input, onChange);
                        row.appendChild(input);
                    } else {
                        const sides = [
                            ['Top', 'Top'],
                            ['Right', 'Right'],
                            ['Bottom', 'Bottom'],
                            ['Left', 'Left']
                        ];
                        for (const [label, side] of sides) {
                            const subGroup = document.createElement('span');
                            subGroup.className = 'inline-group';
                            const subLabel = document.createElement('span');
                            subLabel.className = 'sub-label';
                            subLabel.textContent = label[0];
                            subGroup.appendChild(subLabel);
                            const inp = document.createElement('input');
                            inp.type = 'number';
                            inp.value = el[keyPrefix + side] || 0;
                            inp.step = '1';
                            inp.style.width = '36px';
                            const onChange = (val) => {
                                el[keyPrefix + side] = val;
                                renderAll();
                                pushHistory();
                            };
                            inp.addEventListener('change', () => {
                                onChange(parseFloat(inp.value) || 0);
                            });
                            addScrubber(inp, onChange);
                            subGroup.appendChild(inp);
                            row.appendChild(subGroup);
                        }
                    }

                    group.appendChild(row);
                    return group;
                };

                propertiesContent.appendChild(renderProp('Opacity (0-100)', 'opacity', 'number'));

                if (el.type === 'text') {
                    propertiesContent.appendChild(renderProp('Text Align', 'textAlign', 'select', ['left', 'center',
                        'right', 'justify'
                    ]));
                }

                if (el.type === 'text' || el.type === 'media' || el.type === 'button') {
                    const anchorPicker = renderAnchorPicker(el);
                    if (anchorPicker) {
                        propertiesContent.appendChild(anchorPicker);
                    }
                }

                if (el.type === 'box') {
                    propertiesContent.appendChild(renderProp('Grid Rows', 'gridRows', 'number'));
                    propertiesContent.appendChild(renderProp('Grid Columns', 'gridCols', 'number'));
                    const propGroup = document.createElement('div');
                    propGroup.className = 'prop-group';
                    const propLbl = document.createElement('label');
                    propLbl.textContent = 'Use Proportions';
                    propGroup.appendChild(propLbl);
                    const propRow = document.createElement('div');
                    propRow.className = 'prop-row';
                    const propCheck = document.createElement('input');
                    propCheck.type = 'checkbox';
                    propCheck.checked = el.useProportions || false;
                    propCheck.addEventListener('change', () => {
                        el.useProportions = propCheck.checked;
                        renderAll();
                        pushHistory();
                    });
                    propRow.appendChild(propCheck);
                    propGroup.appendChild(propRow);
                    propertiesContent.appendChild(propGroup);

                    if (el.useProportions) {
                        const rows = el.gridRows || 1;
                        const cols = el.gridCols || 1;
                        const rowProps = el.rowProportions || [];
                        for (let r = 0; r < rows; r++) {
                            const rowGroup = document.createElement('div');
                            rowGroup.className = 'prop-group';
                            const rowLbl = document.createElement('label');
                            rowLbl.textContent = 'Row ' + (r + 1) + ' proportions (%)';
                            rowGroup.appendChild(rowLbl);
                            const rowList = document.createElement('div');
                            rowList.className = 'prop-col-list';
                            const props = (rowProps && rowProps[r]) ? rowProps[r] : Array(cols).fill(100 / cols);
                            for (let c = 0; c < cols; c++) {
                                const item = document.createElement('div');
                                item.className = 'prop-col-item';
                                const label = document.createElement('label');
                                label.textContent = 'Col ' + (c + 1);
                                item.appendChild(label);
                                const inp = document.createElement('input');
                                inp.type = 'number';
                                inp.min = 0;
                                inp.max = 100;
                                inp.step = '1';
                                inp.value = props[c] || 0;
                                inp.addEventListener('change', () => {
                                    let val = parseFloat(inp.value) || 0;
                                    if (val < 0) val = 0;
                                    if (val > 100) val = 100;
                                    if (!el.rowProportions) el.rowProportions = [];
                                    if (!el.rowProportions[r]) el.rowProportions[r] = Array(cols)
                                        .fill(100 / cols);
                                    el.rowProportions[r][c] = val;
                                    const row = el.rowProportions[r];
                                    const total = row.reduce((a, b) => a + b, 0);
                                    if (total > 0 && total !== 100) {
                                        for (let i = 0; i < row.length; i++) {
                                            row[i] = (row[i] / total) * 100;
                                        }
                                    }
                                    renderAll();
                                    pushHistory();
                                });
                                item.appendChild(inp);
                                rowList.appendChild(item);
                            }
                            rowGroup.appendChild(rowList);
                            propertiesContent.appendChild(rowGroup);
                        }
                    }

                    propertiesContent.appendChild(renderMarginPadding('Margin', 'margin'));
                    propertiesContent.appendChild(renderMarginPadding('Padding', 'padding'));
                    propertiesContent.appendChild(renderProp('Background', 'bgColor', 'color'));
                    propertiesContent.appendChild(renderProp('Border Thickness', 'borderSize', 'number'));
                    propertiesContent.appendChild(renderProp('Border Color', 'borderColor', 'color'));
                    propertiesContent.appendChild(renderProp('Border Opacity (0-100)', 'borderOpacity', 'number'));
                    propertiesContent.appendChild(renderProp('Border Style', 'borderStyle', 'select', ['solid',
                        'dashed',
                        'dotted'
                    ]));
                } else if (el.type === 'column') {
                    propertiesContent.appendChild(renderMarginPadding('Padding', 'padding'));
                    propertiesContent.appendChild(renderProp('Background', 'bgColor', 'color'));
                } else if (el.type === 'dynamic-box') {
                    propertiesContent.appendChild(renderProp('ID', 'id', 'text'));
                    propertiesContent.appendChild(renderMarginPadding('Margin', 'margin'));
                    propertiesContent.appendChild(renderMarginPadding('Padding', 'padding'));
                    const pkgSelect = document.createElement('div');
                    pkgSelect.className = 'prop-group';
                    const lbl = document.createElement('label');
                    lbl.textContent = 'Default Package';
                    pkgSelect.appendChild(lbl);
                    const row = document.createElement('div');
                    row.className = 'prop-row';
                    const sel = document.createElement('select');
                    const opt0 = document.createElement('option');
                    opt0.value = '';
                    opt0.textContent = '— none —';
                    sel.appendChild(opt0);
                    for (const p of state.packages) {
                        const o = document.createElement('option');
                        o.value = p.id;
                        o.textContent = p.name;
                        if (el.defaultPackage === p.id) o.selected = true;
                        sel.appendChild(o);
                    }
                    sel.addEventListener('change', () => { el.defaultPackage = sel.value || null;
                        renderAll();
                        pushHistory(); });
                    row.appendChild(sel);
                    pkgSelect.appendChild(row);
                    propertiesContent.appendChild(pkgSelect);
                    const adapt = document.createElement('div');
                    adapt.className = 'prop-group';
                    const albl = document.createElement('label');
                    albl.textContent = 'Auto Adapt';
                    adapt.appendChild(albl);
                    const arow = document.createElement('div');
                    arow.className = 'prop-row';
                    const chk = document.createElement('input');
                    chk.type = 'checkbox';
                    chk.checked = el.autoAdapt !== false;
                    chk.addEventListener('change', () => { el.autoAdapt = chk.checked;
                        renderAll();
                        pushHistory(); });
                    arow.appendChild(chk);
                    adapt.appendChild(arow);
                    propertiesContent.appendChild(adapt);
                } else if (el.type === 'text') {
                    propertiesContent.appendChild(renderProp('Content', 'content', 'textarea'));
                    const fontGroup = document.createElement('div');
                    fontGroup.className = 'prop-group';
                    const fontLbl = document.createElement('label');
                    fontLbl.textContent = 'Font Family';
                    fontGroup.appendChild(fontLbl);
                    const fontRow = document.createElement('div');
                    fontRow.className = 'prop-row';
                    const fontSel = document.createElement('select');
                    for (const f of FONT_LIST) {
                        const opt = document.createElement('option');
                        opt.value = f;
                        opt.textContent = f;
                        if (el.fontFamily === f) opt.selected = true;
                        fontSel.appendChild(opt);
                    }
                    fontSel.addEventListener('change', () => {
                        el.fontFamily = fontSel.value;
                        renderAll();
                        pushHistory();
                    });
                    fontRow.appendChild(fontSel);
                    fontGroup.appendChild(fontRow);
                    propertiesContent.appendChild(fontGroup);
                    propertiesContent.appendChild(renderProp('Font Size', 'fontSize', 'number'));
                    propertiesContent.appendChild(renderProp('Color', 'color', 'color'));
                    propertiesContent.appendChild(renderProp('Font Weight', 'fontWeight', 'select', ['100', '200',
                        '300',
                        '400', '500', '600', '700', '800', '900'
                    ]));
                    propertiesContent.appendChild(renderProp('Letter Spacing', 'letterSpacing', 'number'));
                    propertiesContent.appendChild(renderProp('Line Height', 'lineHeight', 'number'));
                    propertiesContent.appendChild(renderProp('Highlight', 'highlight', 'color'));
                    propertiesContent.appendChild(renderProp('Text Decoration', 'textDecoration', 'select', ['none',
                        'underline', 'line-through'
                    ]));
                    propertiesContent.appendChild(renderMarginPadding('Margin', 'margin'));
                    propertiesContent.appendChild(renderMarginPadding('Padding', 'padding'));
                } else if (el.type === 'media') {
                    propertiesContent.appendChild(renderProp('Media URL', 'src', 'text'));
                    propertiesContent.appendChild(renderProp('Alt Text', 'alt', 'text'));
                    propertiesContent.appendChild(renderProp('Media Type', 'mediaType', 'select', ['image',
                        'video']));
                    if (el.mediaType === 'video') {
                        propertiesContent.appendChild(renderProp('Poster', 'poster', 'text'));
                        propertiesContent.appendChild(renderProp('Autoplay', 'autoplay', 'checkbox'));
                        propertiesContent.appendChild(renderProp('Loop', 'loop', 'checkbox'));
                        propertiesContent.appendChild(renderProp('Controls', 'controls', 'checkbox'));
                    }
                    propertiesContent.appendChild(renderSizeAdjust(el));
                    propertiesContent.appendChild(renderProp('Width (CSS)', 'width', 'text'));
                    propertiesContent.appendChild(renderProp('Height (CSS)', 'height', 'text'));
                    propertiesContent.appendChild(renderProp('Fit', 'fit', 'select', ['fit', 'crop']));
                    propertiesContent.appendChild(renderMarginPadding('Margin', 'margin'));
                    const radiusGroup = document.createElement('div');
                    radiusGroup.className = 'prop-group';
                    const rlbl = document.createElement('label');
                    rlbl.textContent = 'Corner Radius';
                    radiusGroup.appendChild(rlbl);
                    const rrow = document.createElement('div');
                    rrow.className = 'prop-row';
                    const useInd = document.createElement('input');
                    useInd.type = 'checkbox';
                    useInd.checked = el.useIndividualRadius || false;
                    useInd.title = 'Set per corner';
                    useInd.addEventListener('change', () => {
                        el.useIndividualRadius = useInd.checked;
                        renderProperties();
                        renderCanvases();
                        pushHistory();
                    });
                    const indLabel = document.createElement('span');
                    indLabel.textContent = 'Per corner';
                    indLabel.style.fontSize = '10px';
                    indLabel.style.color = '#888';
                    const wrap = document.createElement('span');
                    wrap.style.display = 'flex';
                    wrap.style.alignItems = 'center';
                    wrap.style.gap = '4px';
                    wrap.appendChild(useInd);
                    wrap.appendChild(indLabel);
                    rrow.appendChild(wrap);

                    if (!el.useIndividualRadius) {
                        const inp = document.createElement('input');
                        inp.type = 'number';
                        inp.value = el.cornerRadius || 0;
                        inp.step = '1';
                        const onChange = (val) => {
                            el.cornerRadius = val;
                            renderAll();
                            pushHistory();
                        };
                        inp.addEventListener('change', () => {
                            onChange(parseFloat(inp.value) || 0);
                        });
                        addScrubber(inp, onChange);
                        rrow.appendChild(inp);
                    } else {
                        const corners = [
                            ['TL', 'Top-Left'],
                            ['TR', 'Top-Right'],
                            ['BR', 'Bottom-Right'],
                            ['BL', 'Bottom-Left']
                        ];
                        for (const [key, label] of corners) {
                            const sub = document.createElement('span');
                            sub.className = 'inline-group';
                            const lbl = document.createElement('span');
                            lbl.className = 'sub-label';
                            lbl.textContent = label;
                            sub.appendChild(lbl);
                            const inp = document.createElement('input');
                            inp.type = 'number';
                            inp.value = el['cornerRadius' + key] || 0;
                            inp.step = '1';
                            inp.style.width = '36px';
                            const onChange = (val) => {
                                el['cornerRadius' + key] = val;
                                renderAll();
                                pushHistory();
                            };
                            inp.addEventListener('change', () => {
                                onChange(parseFloat(inp.value) || 0);
                            });
                            addScrubber(inp, onChange);
                            sub.appendChild(inp);
                            rrow.appendChild(sub);
                        }
                    }
                    radiusGroup.appendChild(rrow);
                    propertiesContent.appendChild(radiusGroup);
                    propertiesContent.appendChild(renderProp('Shape', 'shape', 'select', ['rectangle', 'circle',
                        'diamond'
                    ]));
                    const cropGroup = document.createElement('div');
                    cropGroup.className = 'prop-group';
                    const clbl = document.createElement('label');
                    clbl.textContent = 'Crop (%, 0-100)';
                    cropGroup.appendChild(clbl);
                    const crow = document.createElement('div');
                    crow.className = 'prop-row';
                    const sides = [
                        ['Top', 'Top'],
                        ['Right', 'Right'],
                        ['Bottom', 'Bottom'],
                        ['Left', 'Left']
                    ];
                    for (const [label, side] of sides) {
                        const sub = document.createElement('span');
                        sub.className = 'inline-group';
                        const lbl = document.createElement('span');
                        lbl.className = 'sub-label';
                        lbl.textContent = label[0];
                        sub.appendChild(lbl);
                        const inp = document.createElement('input');
                        inp.type = 'number';
                        inp.value = el['crop' + side] || 0;
                        inp.step = '1';
                        inp.min = 0;
                        inp.max = 100;
                        inp.style.width = '36px';
                        const onChange = (val) => {
                            el['crop' + side] = val;
                            renderAll();
                            pushHistory();
                        };
                        inp.addEventListener('change', () => {
                            onChange(parseFloat(inp.value) || 0);
                        });
                        addScrubber(inp, onChange);
                        sub.appendChild(inp);
                        crow.appendChild(sub);
                    }
                    cropGroup.appendChild(crow);
                    propertiesContent.appendChild(cropGroup);
                } else if (el.type === 'media-grid') {
                    propertiesContent.appendChild(renderProp('Layout', 'layout', 'select', ['grid', 'masonry']));
                    propertiesContent.appendChild(renderProp('Columns (grid)', 'gridCols', 'number'));
                    propertiesContent.appendChild(renderProp('Fit', 'fit', 'select', ['fit', 'crop']));
                    propertiesContent.appendChild(renderProp('Corner Radius', 'cornerRadius', 'number'));
                    const imgGroup = document.createElement('div');
                    imgGroup.className = 'prop-group';
                    const ilbl = document.createElement('label');
                    ilbl.textContent = 'Media Items (' + (el.items || []).length + ')';
                    imgGroup.appendChild(ilbl);
                    const irow = document.createElement('div');
                    irow.className = 'prop-row';
                    const addBtn = document.createElement('button');
                    addBtn.textContent = 'Add Media';
                    addBtn.addEventListener('click', () => {
                        const url = prompt('Media URL:');
                        if (url) {
                            const mediaType = url.match(/\.(mp4|webm|ogg)$/i) ? 'video' : 'image';
                            if (!el.items) el.items = [];
                            el.items.push({ src: url, alt: '', mediaType: mediaType, poster: '',
                            assetId: null });
                            renderAll();
                            pushHistory();
                        }
                    });
                    irow.appendChild(addBtn);
                    const clearBtn = document.createElement('button');
                    clearBtn.textContent = 'Clear';
                    clearBtn.addEventListener('click', () => { el.items = [];
                        renderAll();
                        pushHistory(); });
                    irow.appendChild(clearBtn);
                    imgGroup.appendChild(irow);
                    propertiesContent.appendChild(imgGroup);
                    propertiesContent.appendChild(renderMarginPadding('Margin', 'margin'));
                    propertiesContent.appendChild(renderMarginPadding('Padding', 'padding'));
                } else if (el.type === 'button') {
                    propertiesContent.appendChild(renderProp('Action', 'action', 'select', ['link', 'page',
                        'dynamic'
                    ]));
                    const pageGroup = document.createElement('div');
                    pageGroup.className = 'prop-group';
                    const pageLbl = document.createElement('label');
                    pageLbl.textContent = 'Canvas (page)';
                    pageGroup.appendChild(pageLbl);
                    const pageRow = document.createElement('div');
                    pageRow.className = 'prop-row';
                    const pageSel = document.createElement('select');
                    const opt0 = document.createElement('option');
                    opt0.value = '';
                    opt0.textContent = '— select —';
                    pageSel.appendChild(opt0);
                    for (const c of state.canvases) {
                        const opt = document.createElement('option');
                        opt.value = c.name;
                        opt.textContent = c.name;
                        if (el.actionCanvas === c.name) opt.selected = true;
                        pageSel.appendChild(opt);
                    }
                    pageSel.addEventListener('change', () => {
                        el.actionCanvas = pageSel.value;
                        renderAll();
                        pushHistory();
                    });
                    pageRow.appendChild(pageSel);
                    pageGroup.appendChild(pageRow);
                    propertiesContent.appendChild(pageGroup);
                    if (el.action !== 'page') {
                        pageGroup.style.display = 'none';
                    }
                    const selects = propertiesContent.querySelectorAll('select');
                    let actionSelectEl = null;
                    for (const sel of selects) {
                        if (sel.parentElement.parentElement.querySelector('label')?.textContent === 'Action') {
                            actionSelectEl = sel;
                            break;
                        }
                    }
                    if (actionSelectEl) {
                        actionSelectEl.addEventListener('change', function() {
                            const val = this.value;
                            const pageGroupEl = propertiesContent.querySelector(
                                '.prop-group:has(label:contains("Canvas (page)"))');
                            if (pageGroupEl) {
                                pageGroupEl.style.display = (val === 'page') ? 'block' : 'none';
                            }
                            el.action = val;
                            renderAll();
                            pushHistory();
                        });
                    }
                    propertiesContent.appendChild(renderProp('Action URL (link)', 'actionUrl', 'text'));
                    propertiesContent.appendChild(renderProp('Target (link)', 'actionTarget', 'select', ['_blank',
                        '_self', '_parent', '_top'
                    ]));
                    propertiesContent.appendChild(renderProp('Dynamic Box ID', 'actionDynamicBox', 'text'));
                    propertiesContent.appendChild(renderProp('Package Name', 'actionPackage', 'text'));
                    propertiesContent.appendChild(renderProp('Corner Radius', 'cornerRadius', 'number'));
                    propertiesContent.appendChild(renderProp('Background', 'bgColor', 'color'));
                    propertiesContent.appendChild(renderProp('Text Color', 'color', 'color'));
                    propertiesContent.appendChild(renderProp('Border Size', 'borderSize', 'number'));
                    propertiesContent.appendChild(renderProp('Border Color', 'borderColor', 'color'));
                    propertiesContent.appendChild(renderProp('Auto Width', 'autoWidth', 'checkbox'));
                    propertiesContent.appendChild(renderProp('Width (CSS)', 'width', 'text'));
                    propertiesContent.appendChild(renderProp('Height (CSS)', 'height', 'text'));
                    propertiesContent.appendChild(renderProp('Font Size', 'fontSize', 'number'));
                    propertiesContent.appendChild(renderMarginPadding('Margin', 'margin'));
                    propertiesContent.appendChild(renderMarginPadding('Padding', 'padding'));
                }

                const styleGroup = document.createElement('div');
                styleGroup.className = 'prop-group';
                const slbl = document.createElement('label');
                slbl.textContent = 'Style Class';
                styleGroup.appendChild(slbl);
                const srow = document.createElement('div');
                srow.className = 'prop-row';
                const sel = document.createElement('select');
                const opt0 = document.createElement('option');
                opt0.value = '';
                opt0.textContent = '— none —';
                sel.appendChild(opt0);
                for (const [name] of Object.entries(state.styles)) {
                    const o = document.createElement('option');
                    o.value = name;
                    o.textContent = name;
                    if ((el.classes || []).includes(name)) o.selected = true;
                    sel.appendChild(o);
                }
                sel.addEventListener('change', () => {
                    if (!el.classes) el.classes = [];
                    const val = sel.value;
                    if (val && !el.classes.includes(val)) el.classes.push(val);
                    else if (!val) el.classes = [];
                    renderAll();
                    pushHistory();
                });
                srow.appendChild(sel);
                styleGroup.appendChild(srow);
                propertiesContent.appendChild(styleGroup);

                const delGroup = document.createElement('div');
                delGroup.className = 'prop-group';
                const delRow = document.createElement('div');
                delRow.className = 'prop-row';
                const delBtn = document.createElement('button');
                delBtn.textContent = 'Delete Element';
                delBtn.style.color = '#ff6666';
                delBtn.style.borderColor = '#4a2a2a';
                delBtn.addEventListener('click', () => {
                    removeElement(el.id);
                    renderAll();
                    pushHistory();
                });
                delRow.appendChild(delBtn);
                delGroup.appendChild(delRow);
                propertiesContent.appendChild(delGroup);
            }

            let selectionPending = false;

            function selectElement(id) {
                state.selectedElementId = id;
                renderProperties();
                renderLayersPanel();
                if (!selectionPending) {
                    selectionPending = true;
                    requestAnimationFrame(() => {
                        selectionPending = false;
                        renderCanvases();
                    });
                }
            }

            function updateToolbarState() {
                document.querySelectorAll('#toolbar .group button.active').forEach(b => b.classList.remove('active'));
                const devMap = { desktop: 'dev-desktop', tablet: 'dev-tablet', phone: 'dev-phone' };
                const btn = document.getElementById(devMap[state.deviceMode]);
                if (btn) btn.classList.add('active');
            }

            const containerEl = document.getElementById('canvas-container');
            const scrollEl = document.getElementById('canvas-scroll');

            function applyZoomPan() {
                scrollEl.style.transform = 'scale(' + state.zoom + ') translate(' + state.panX + 'px, ' + state.panY +
                    'px)';
                scrollEl.style.transformOrigin = '0 0';
            }

            document.querySelectorAll('.palette-item').forEach(item => {
                item.draggable = true;
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', item.dataset.type);
                    e.dataTransfer.effectAllowed = 'copy';
                });
            });

            document.querySelectorAll('.floating-panel .btn-minimize').forEach(btn => {
                btn.addEventListener('click', () => {
                    const panel = btn.closest('.floating-panel');
                    panel.classList.toggle('minimized');
                    btn.textContent = panel.classList.contains('minimized') ? '+' : '_';
                });
            });

            document.querySelectorAll('.floating-panel .panel-header').forEach(header => {
                const panel = header.closest('.floating-panel');
                let dragging = false,
                    startX, startY, origX, origY;
                header.addEventListener('mousedown', (e) => {
                    if (e.target.closest('.pcontrols')) return;
                    dragging = true;
                    const rect = panel.getBoundingClientRect();
                    startX = e.clientX;
                    startY = e.clientY;
                    origX = rect.left;
                    origY = rect.top;
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                });

                function onMove(e) {
                    if (!dragging) return;
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    panel.style.left = (origX + dx) + 'px';
                    panel.style.top = (origY + dy) + 'px';
                    panel.style.right = 'auto';
                    panel.style.bottom = 'auto';
                }

                function onUp() {
                    dragging = false;
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                }
            });

            containerEl.addEventListener('mousedown', (e) => {
                if (e.button === 1) {
                    e.preventDefault();
                    const startX = e.clientX,
                        startY = e.clientY;
                    const startPanX = state.panX,
                        startPanY = state.panY;
                    const onMove = (ev) => {
                        state.panX = startPanX + (ev.clientX - startX) / state.zoom;
                        state.panY = startPanY + (ev.clientY - startY) / state.zoom;
                        applyZoomPan();
                    };
                    const onUp = () => { document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp); };
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                }
            });

            containerEl.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.05 : 0.05;
                state.zoom = Math.max(0.1, Math.min(3, state.zoom + delta));
                applyZoomPan();
            }, { passive: false });

            const contextMenu = document.getElementById('context-menu');
            let contextTargetCanvasId = null;
            let contextTargetElementId = null;

            function showContextMenu(x, y, canvasId, elementId) {
                contextTargetCanvasId = canvasId;
                contextTargetElementId = elementId;
                contextMenu.style.display = 'block';
                contextMenu.style.left = x + 'px';
                contextMenu.style.top = y + 'px';
                const items = contextMenu.querySelectorAll('.menu-item');
                items.forEach(item => {
                    const action = item.dataset.action;
                    if (action === 'mark-main') {
                        item.style.display = canvasId ? 'block' : 'none';
                    } else {
                        item.style.display = elementId ? 'block' : 'none';
                    }
                    if (!elementId && action !== 'mark-main') {
                        item.classList.add('disabled');
                    } else {
                        item.classList.remove('disabled');
                    }
                });
            }

            function hideContextMenu() {
                contextMenu.style.display = 'none';
            }

            contextMenu.addEventListener('click', (e) => {
                const item = e.target.closest('.menu-item');
                if (!item || item.classList.contains('disabled')) return;
                const action = item.dataset.action;
                if (action === 'delete' && contextTargetElementId) {
                    removeElement(contextTargetElementId);
                    renderAll();
                    pushHistory();
                } else if (action === 'bring-forward' && contextTargetElementId) {
                    bringForward(contextTargetElementId);
                    renderAll();
                    pushHistory();
                } else if (action === 'send-backward' && contextTargetElementId) {
                    sendBackward(contextTargetElementId);
                    renderAll();
                    pushHistory();
                } else if (action === 'bring-to-front' && contextTargetElementId) {
                    bringToFront(contextTargetElementId);
                    renderAll();
                    pushHistory();
                } else if (action === 'send-to-back' && contextTargetElementId) {
                    sendToBack(contextTargetElementId);
                    renderAll();
                    pushHistory();
                } else if (action === 'mark-main' && contextTargetCanvasId) {
                    const canvas = findCanvas(contextTargetCanvasId);
                    if (canvas) {
                        state.canvases.forEach(c => c.isMain = false);
                        canvas.isMain = true;
                        renderAll();
                        pushHistory();
                    }
                }
                hideContextMenu();
            });

            document.addEventListener('click', (e) => {
                if (!contextMenu.contains(e.target)) {
                    hideContextMenu();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    undo();
                } else if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
                    e.preventDefault();
                    redo();
                }
            });

            // -------- SAVE / OPEN / EXPORT --------
            document.getElementById('btn-save').addEventListener('click', () => {
                // Clean up blob URLs before saving - we store the data URL
                const data = JSON.stringify({
                    canvases: state.canvases,
                    packages: state.packages,
                    styles: state.styles,
                    assets: state.assets.map(a => ({
                        id: a.id,
                        type: a.type,
                        name: a.name,
                        url: a.url, // keep the URL for reference
                        data: a.data, // store the base64 data
                    })),
                    nextId: state.nextId,
                });
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'project.json';
                a.click();
                URL.revokeObjectURL(url);
            });

            document.getElementById('btn-open').addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = () => {
                    const file = input.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            const data = JSON.parse(e.target.result);
                            state.canvases = data.canvases || [];
                            state.packages = data.packages || [];
                            state.styles = data.styles || {};
                            state.assets = data.assets || [];
                            state.nextId = data.nextId || 1;

                            // Recreate blob URLs for assets
                            for (const asset of state.assets) {
                                if (asset.data && asset.data.startsWith('data:')) {
                                    const blob = dataURLToBlob(asset.data);
                                    const url = URL.createObjectURL(blob);
                                    state.assetBlobMap[asset.id] = url;
                                    asset.url = url;
                                } else if (asset.url && !asset.url.startsWith('blob:')) {
                                    // Keep external URLs as-is
                                }
                            }

                            if (state.canvases.length === 0) {
                                const main = createCanvas('main', 1920, 1080, 'main', true);
                                state.canvases.push(main);
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
                            state.selectedCanvasId = state.canvases[0]?.id || null;
                            renderAll();
                            pushHistory();
                        } catch (err) {
                            alert('Failed to load project: ' + err.message);
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            });

            // ---- EXPORT HTML ----
            document.getElementById('btn-export').addEventListener('click', () => {
                const mainCanvas = state.canvases.find(c => c.isMain) || state.canvases[0];
                if (!mainCanvas) return;

                // For plain export, we replace blob URLs with asset paths
                // Since we're not zipping, we need to use data URLs
                const urlToPath = {};
                for (const asset of state.assets) {
                    if (asset.url && asset.url.startsWith('blob:')) {
                        // Use the stored data URL
                        if (asset.data) {
                            urlToPath[asset.url] = asset.data;
                        }
                    }
                }

                const html = buildExportHTML(mainCanvas, urlToPath);
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'exported-page.html';
                a.click();
                URL.revokeObjectURL(url);
            });

            // ---- EXPORT ZIP ----
            document.getElementById('btn-export-zip').addEventListener('click', async function() {
                const mainCanvas = state.canvases.find(c => c.isMain) || state.canvases[0];
                if (!mainCanvas) return;

                // Collect used assets
                const usedAssetIds = new Set();
                const collectAssetIds = (el) => {
                    if (el.assetId) {
                        usedAssetIds.add(el.assetId);
                    }
                    if (el.items) {
                        for (const item of el.items) {
                            if (item.assetId) usedAssetIds.add(item.assetId);
                        }
                    }
                    if (el.children) {
                        for (const child of el.children) {
                            collectAssetIds(child);
                        }
                    }
                };
                for (const c of state.canvases) {
                    for (const layer of c.layers) {
                        for (const el of layer.elements) {
                            collectAssetIds(el);
                        }
                    }
                }
                for (const pkg of state.packages) {
                    for (const el of pkg.elements) {
                        collectAssetIds(el);
                    }
                }

                // Build URL to path mapping using original asset filenames
                const urlToPath = {};
                const assetFiles = [];
                const usedNames = new Set();
                for (const asset of state.assets) {
                    if (usedAssetIds.has(asset.id) && asset.data) {
                        let fileName = asset.name;
                        // Handle duplicate filenames by appending asset ID
                        if (usedNames.has(fileName)) {
                            const dotIndex = fileName.lastIndexOf('.');
                            if (dotIndex > 0) {
                                fileName = fileName.slice(0, dotIndex) + '-' + asset.id + fileName.slice(dotIndex);
                            } else {
                                fileName = fileName + '-' + asset.id;
                            }
                        }
                        usedNames.add(fileName);
                        const path = 'assets/' + fileName;
                        urlToPath[asset.url] = path;
                        assetFiles.push({
                            id: asset.id,
                            path: path,
                            data: asset.data,
                        });
                    }
                }

                // Build HTML with replaced URLs
                const html = buildExportHTML(mainCanvas, urlToPath);

                const zip = new JSZip();
                zip.file('index.html', html);

                // Add assets to assets/ folder
                for (const file of assetFiles) {
                    const base64 = file.data.split(',')[1];
                    if (base64) {
                        zip.file(file.path, base64, { base64: true });
                    }
                }

                const zipBlob = await zip.generateAsync({ type: 'blob' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(zipBlob);
                a.download = 'project-export.zip';
                a.click();
                URL.revokeObjectURL(a.href);
            });

            // Build export HTML helper
            function buildExportHTML(mainCanvas, urlToPath = {}) {
                const allCanvases = state.canvases.map(c => {
                    const clone = JSON.parse(JSON.stringify(c));
                    clone.layers = clone.layers.filter(l => !l.isBuffer);
                    return clone;
                });
                const canvasDataMap = {};
                for (const c of allCanvases) {
                    canvasDataMap[c.name] = c;
                }

                // Replace URLs in data
                function replaceUrlsInData(obj) {
                    if (!obj) return;
                    if (typeof obj === 'string') {
                        // Check if this is a URL that needs replacement
                        for (const [url, path] of Object.entries(urlToPath)) {
                            if (obj === url) {
                                return path;
                            }
                        }
                        return obj;
                    }
                    if (Array.isArray(obj)) {
                        for (let i = 0; i < obj.length; i++) {
                            obj[i] = replaceUrlsInData(obj[i]);
                        }
                        return obj;
                    }
                    if (typeof obj === 'object') {
                        for (const key of Object.keys(obj)) {
                            obj[key] = replaceUrlsInData(obj[key]);
                        }
                        return obj;
                    }
                    return obj;
                }

                const dataClone = JSON.parse(JSON.stringify(canvasDataMap));
                const replacedData = replaceUrlsInData(dataClone);
                const packagesClone = JSON.parse(JSON.stringify(state.packages));
                const replacedPackages = replaceUrlsInData(packagesClone);

                let html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Exported Page</title>';
                html += `<style>
                            * { margin:0; padding:0; box-sizing:border-box; }
                            body { background:#0d0d0d; display:flex; justify-content:center; align-items:center; min-height:100vh; font-family:Inter,sans-serif; }
                            .page-container { position:relative; width:${mainCanvas.width}px; height:${mainCanvas.height}px; background:${mainCanvas.bgColor || '#ffffff'}; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.6); }
                            .buffer-layer { position:absolute; top:0; left:0; width:100%; height:100%; z-index:999; display:none; overflow:auto; background:rgba(0,0,0,0.1); pointer-events:none; }
                            .buffer-layer.active { display:block; pointer-events:auto; background:rgba(0,0,0,0.8); }
                            .buffer-layer .close-btn { position:absolute; top:10px; right:16px; font-size:24px; color:#888; background:none; border:none; cursor:pointer; z-index:1000; pointer-events:auto; }
                            .buffer-layer .close-btn:hover { color:#fff; }
                            .buffer-layer #buffer-content { width:100%; height:100%; pointer-events:auto; overflow:auto; }
                            .el-box, .el-text, .el-media, .el-media-grid, .el-button-container, .el-dynamic-box { margin:2px 0; }
                            .el-box { background:#252525; border:1px solid #333; border-radius:3px; padding:6px; min-height:20px; }
                            .el-box .el-grid { display:flex; flex-direction:column; gap:4px; width:100%; height:100%; min-height:20px; }
                            .el-box .el-grid .el-row { display:flex; gap:4px; width:100%; flex:1 1 auto; min-height:20px; }
                            .el-box .el-grid .el-col { background:#1e1e1e; border:1px dashed #444; border-radius:2px; padding:4px; min-height:20px; position:relative; display:flex; flex-direction:column; box-sizing:border-box; flex:1 1 0; }
                            .el-text { padding:2px 4px; cursor:text; }
                            .el-text:focus { outline:1px solid #4a8ac4; outline-offset:1px; }
                            .el-media img, .el-media video { display:block; max-width:100%; height:auto; }
                            .el-media .media-align-wrap { display:flex; width:100%; height:100%; }
                            .el-media.crop img, .el-media.crop video { object-fit:cover; height:100%; }
                            .el-media.fit img, .el-media.fit video { object-fit:contain; }
                            .el-button-container .el-button { display:inline-flex; flex-direction:column; align-items:center; justify-content:center; border-radius:4px; background:#2a5a8a; color:#fff; border:none; cursor:pointer; font-size:13px; box-sizing:border-box; font-family:inherit; padding:4px 12px; min-height:30px; min-width:30px; }
                            .el-button-container .el-button:hover { background:#3a6a9a; }
                            .el-button-container .el-button .btn-content { display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; pointer-events:none; }
                            .el-button-container .el-button .btn-content .el-text { margin:0; padding:0; }
                            .el-button-container .el-button .btn-content .el-media { margin:0; }
                            .el-button-container .el-button .btn-content .el-media img { max-width:100%; height:auto; }
                            .el-media-grid { display:grid; gap:4px; }
                            .el-media-grid.masonry { display:block; column-count:3; }
                            .el-media-grid.masonry .media-item { break-inside:avoid; margin-bottom:4px; }
                            .el-media-grid .media-item { overflow:hidden; border-radius:2px; cursor:pointer; }
                            .el-media-grid .media-item img, .el-media-grid .media-item video { width:100%; display:block; }
                            .el-media-grid .media-item.crop img, .el-media-grid .media-item.crop video { object-fit:cover; height:100%; }
                            .el-media-grid .media-item.fit img, .el-media-grid .media-item.fit video { object-fit:contain; }
                            .el-dynamic-box { background:#1a2a2a; border:1px dashed #3a5a5a; border-radius:3px; padding:6px; min-height:30px; }
                            .el-dynamic-box .db-label { font-size:10px; color:#5a8a8a; margin-bottom:4px; }
                            #lightbox { position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:9999; display:none; align-items:center; justify-content:center; padding:40px; cursor:pointer; }
                            #lightbox.active { display:flex; }
                            #lightbox img { max-width:90%; max-height:90%; border-radius:6px; box-shadow:0 20px 60px rgba(0,0,0,0.9); }
                        </style>`;
                html += '</head><body>';

                // Clone and replace blob URLs with export paths for static HTML generation
                const mainCanvasExport = JSON.parse(JSON.stringify(mainCanvas));
                replaceUrlsInData(mainCanvasExport);

                html += `<div class="page-container" id="main-container">`;
                for (let i = 0; i < mainCanvasExport.layers.length; i++) {
                    const layer = mainCanvasExport.layers[i];
                    if (layer.isBuffer) continue;
                    html +=
                        `<div style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:${i};overflow:auto;">`;
                    for (const el of layer.elements) {
                        html += exportElementToHTML(el);
                    }
                    html += `</div>`;
                }
                html +=
                    `<div class="buffer-layer" id="buffer-layer"><button class="close-btn" id="buffer-close">&times;</button><div id="buffer-content" style="width:100%;height:100%;"></div></div>`;
                html += `</div>`;

                html += `<div id="lightbox"><img id="lightbox-img" src="" alt="" /></div>`;

                html += `<script>
                        const canvasesData = ${JSON.stringify(replacedData)};
                        const packagesData = ${JSON.stringify(replacedPackages)};

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

                        function exportElementToHTML(el) {
                            switch (el.type) {
                                case 'box': {
                                    const rows = el.gridRows || 1;
                                    const cols = el.gridCols || 1;
                                    const rowProps = el.rowProportions || [];
                                    let html = '<div style="padding:' + (el.padding||0) + 'px;margin:' + (el.margin||0) + 'px;background:' + (el.bgColor||'transparent') + ';border:' + (el.borderSize||0) + 'px solid ' + (el.borderColor||'transparent') + ';border-radius:3px;display:flex;flex-direction:column;gap:4px;width:100%;height:100%;min-height:20px;">';
                                    const children = el.children || [];
                                    for (let r = 0; r < rows; r++) {
                                        html += '<div style="display:flex;gap:4px;width:100%;flex:1 1 auto;min-height:20px;">';
                                        const props = (rowProps && rowProps[r]) ? rowProps[r] : Array(cols).fill(100/cols);
                                        for (let c = 0; c < cols; c++) {
                                            const idx = r * cols + c;
                                            const col = children[idx] || { children: [], padding: 0, bgColor: 'transparent' };
                                            const pct = el.useProportions ? (props[c] || 0) : (100/cols);
                                            html += '<div style="flex:0 0 ' + pct + '%;width:' + pct + '%;padding:' + (col.padding||0) + 'px;background:' + (col.bgColor||'transparent') + ';box-sizing:border-box;min-height:20px;position:relative;display:flex;flex-direction:column;flex:1 1 0;">';
                                            for (const child of (col.children||[])) {
                                                html += exportElementToHTML(child);
                                            }
                                            html += '</div>';
                                        }
                                        html += '</div>';
                                    }
                                    html += '</div>';
                                    return html;
                                }
                                case 'dynamic-box': {
                                    let html = '<div style="padding:6px;background:#1a2a2a;border:1px dashed #3a5a5a;border-radius:3px;margin:2px 0;">';
                                    html += '<div style="font-size:10px;color:#5a8a8a;">Dynamic: ' + (el.id||'') + '</div>';
                                    if (el.defaultPackage) {
                                        const pkg = packagesData.find(p => p.id === el.defaultPackage);
                                        if (pkg) {
                                            for (const e of pkg.elements) {
                                                html += exportElementToHTML(e);
                                            }
                                        }
                                    }
                                    html += '</div>';
                                    return html;
                                }
                                case 'text': {
                                    let textAlign = el.textAlign || 'left';
                                    let anchor = el.anchor || 'tl';
                                    const styles = getAnchorStyles(anchor);
                                    return '<div style="display:flex;width:100%;height:100%;justify-content:' + styles.justifyContent + ';align-items:' + styles.alignItems + ';"><div style="font-family:' + (el.fontFamily||'Inter') + ';font-size:' + (el.fontSize||16) + 'px;color:' + (el.color||'#e0e0e0') + ';font-weight:' + (el.fontWeight||'400') + ';font-style:' + (el.fontStyle||'normal') + ';text-decoration:' + (el.textDecoration||'none') + ';text-align:' + textAlign + ';letter-spacing:' + (el.letterSpacing||0) + 'px;line-height:' + (el.lineHeight||1.5) + ';padding:2px 4px;">' + (el.content||'Text') + '</div></div>';
                                }
                                case 'media': {
                                    const anchor = el.anchor || 'tl';
                                    const styles = getAnchorStyles(anchor);
                                    const sizeAdj = el.sizeAdjust || 0;
                                    const scaleFactor = 1 + (sizeAdj / 100);
                                    const style = 'display:block;transform:scale(' + scaleFactor + ');transform-origin:center center;max-width:100%;height:auto;width:' + (el.width || 'auto') + ';height:' + (el.height || 'auto') + ';margin:' + (el.margin||0) + 'px;border-radius:' + (el.cornerRadius||0) + 'px;object-fit:' + (el.fit==='crop'?'cover':'contain') + ';';
                                    const wrapStyle = 'display:flex;width:100%;height:100%;justify-content:' + styles.justifyContent + ';align-items:' + styles.alignItems + ';';
                                    if (el.mediaType === 'video') {
                                        return '<div style="' + wrapStyle + '"><video src="' + (el.src||'') + '" poster="' + (el.poster||'') + '" controls style="' + style + '"></video></div>';
                                    } else {
                                        return '<div style="' + wrapStyle + '"><img src="' + (el.src||'') + '" alt="' + (el.alt||'') + '" style="' + style + '" /></div>';
                                    }
                                }
                                case 'media-grid': {
                                    let html = '<div style="display:' + (el.layout==='masonry'?'block':'grid') + ';grid-template-columns:repeat(' + (el.gridCols||3) + ',1fr);gap:4px;' + (el.layout==='masonry'?'column-count:3;':'') + '">';
                                    for (const item of (el.items||[])) {
                                        html += '<div style="margin:' + (el.margin||0) + 'px;border-radius:' + (el.cornerRadius||0) + 'px;overflow:hidden;' + (el.layout==='masonry'?'break-inside:avoid;margin-bottom:4px;':'') + '">';
                                        if (item.mediaType === 'video') {
                                            html += '<video src="' + (item.src||'') + '" poster="' + (item.poster||'') + '" controls style="width:100%;display:block;object-fit:' + (el.fit==='crop'?'cover':'contain') + ';' + (el.fit==='crop'?'height:120px;':'') + '"></video>';
                                        } else {
                                            html += '<img src="' + (item.src||'') + '" alt="' + (item.alt||'') + '" style="width:100%;display:block;object-fit:' + (el.fit==='crop'?'cover':'contain') + ';' + (el.fit==='crop'?'height:120px;':'') + '" />';
                                        }
                                        html += '</div>';
                                    }
                                    html += '</div>';
                                    return html;
                                }
                                case 'button': {
                                    const anchor = el.anchor || 'tl';
                                    const styles = getAnchorStyles(anchor);
                                    const action = el.action || 'link';
                                    const dataAttrs = ' data-action="' + action + '" data-url="' + (el.actionUrl||'#') + '" data-target="' + (el.actionTarget||'_blank') + '" data-canvas="' + (el.actionCanvas||'') + '" data-dynamic-box="' + (el.actionDynamicBox||'') + '" data-package="' + (el.actionPackage||'') + '"';
                                    let style = 'border-radius:' + (el.cornerRadius||4) + 'px;background:' + (el.bgColor||'#2a5a8a') + ';color:' + (el.color||'#ffffff') + ';border:' + (el.borderSize||0) + 'px solid ' + (el.borderColor||'transparent') + ';padding:4px 12px;cursor:pointer;font-size:' + (el.fontSize||13) + 'px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-height:30px;min-width:30px;';
                                    if (el.autoWidth !== false) {
                                        style += 'width:auto;';
                                    } else if (el.width) {
                                        style += 'width:' + el.width + ';';
                                    }
                                    if (el.height) style += 'height:' + el.height + ';';
                                    const wrapStyle = 'display:flex;width:100%;height:100%;justify-content:' + styles.justifyContent + ';align-items:' + styles.alignItems + ';';

                                    let contentHtml = '';
                                    if (el.children && el.children.length > 0) {
                                        for (const child of el.children) {
                                            contentHtml += exportElementToHTML(child);
                                        }
                                    } else {
                                        contentHtml = '<span style="color:inherit;font-size:inherit;">' + (el.label||'Button') + '</span>';
                                    }

                                    return '<div style="' + wrapStyle + '"><button class="el-button" style="' + style + '"' + dataAttrs + '><div class="btn-content" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;pointer-events:none;">' + contentHtml + '</div></button></div>';
                                }
                                default:
                                    return '<div>Unknown</div>';
                            }
                        }

                        document.addEventListener('click', function(e) {
                            const btn = e.target.closest('.el-button');
                            if (!btn) return;
                            const action = btn.dataset.action || 'link';
                            if (action === 'link') {
                                const url = btn.dataset.url || '#';
                                const target = btn.dataset.target || '_blank';
                                window.open(url, target);
                            } else if (action === 'page') {
                                const canvasName = btn.dataset.canvas || '';
                                const targetCanvas = canvasesData[canvasName];
                                if (!targetCanvas) return;
                                const buffer = document.getElementById('buffer-layer');
                                const content = document.getElementById('buffer-content');
                                buffer.style.background = targetCanvas.bgColor || '#ffffff';
                                content.innerHTML = '';
                                const layers = targetCanvas.layers || [];
                                for (let i = 0; i < layers.length; i++) {
                                    const layer = layers[i];
                                    if (layer.isBuffer) continue;
                                    const layerDiv = document.createElement('div');
                                    layerDiv.style.position = 'absolute';
                                    layerDiv.style.top = '0';
                                    layerDiv.style.left = '0';
                                    layerDiv.style.width = '100%';
                                    layerDiv.style.height = '100%';
                                    layerDiv.style.zIndex = i;
                                    layerDiv.style.overflow = 'auto';
                                    let inner = '';
                                    for (const el of layer.elements) {
                                        inner += exportElementToHTML(el);
                                    }
                                    layerDiv.innerHTML = inner;
                                    content.appendChild(layerDiv);
                                }
                                buffer.classList.add('active');
                            } else if (action === 'dynamic') {
                                const dbId = btn.dataset.dynamicBox || '';
                                const pkgName = btn.dataset.package || '';
                                if (dbId && pkgName) {
                                    alert('Dynamic: ' + dbId + ' -> ' + pkgName);
                                }
                            }
                        });

                        document.getElementById('buffer-close').addEventListener('click', function(e) {
                            e.stopPropagation();
                            document.getElementById('buffer-layer').classList.remove('active');
                        });
                        document.getElementById('buffer-layer').addEventListener('click', function(e) {
                            if (e.target === this) {
                                this.classList.remove('active');
                            }
                        });

                        document.addEventListener('click', function(e) {
                            const mediaItem = e.target.closest('.media-item');
                            if (mediaItem) {
                                const img = mediaItem.querySelector('img');
                                if (img) {
                                    const lb = document.getElementById('lightbox');
                                    const lbImg = document.getElementById('lightbox-img');
                                    lbImg.src = img.src;
                                    lb.classList.add('active');
                                }
                            }
                        });
                        document.getElementById('lightbox').addEventListener('click', function() {
                            this.classList.remove('active');
                        });
                    <\/script>`;

                html += '</body></html>';
                return html;
            }

            // Helper: exportElementToHTML for export
            function exportElementToHTML(el) {
                switch (el.type) {
                    case 'box': {
                        const rows = el.gridRows || 1;
                        const cols = el.gridCols || 1;
                        const rowProps = el.rowProportions || [];
                        let html = '<div style="padding:' + (el.padding || 0) + 'px;margin:' + (el.margin || 0) +
                            'px;background:' + (el.bgColor || 'transparent') + ';border:' + (el.borderSize || 0) +
                            'px solid ' + (el.borderColor || 'transparent') +
                            ';border-radius:3px;display:flex;flex-direction:column;gap:4px;width:100%;height:100%;min-height:20px;">';
                        const children = el.children || [];
                        for (let r = 0; r < rows; r++) {
                            html +=
                                '<div style="display:flex;gap:4px;width:100%;flex:1 1 auto;min-height:20px;">';
                            const props = (rowProps && rowProps[r]) ? rowProps[r] : Array(cols).fill(100 / cols);
                            for (let c = 0; c < cols; c++) {
                                const idx = r * cols + c;
                                const col = children[idx] || { children: [], padding: 0, bgColor: 'transparent' };
                                const pct = el.useProportions ? (props[c] || 0) : (100 / cols);
                                html += '<div style="flex:0 0 ' + pct + '%;width:' + pct + '%;padding:' + (col
                                        .padding || 0) + 'px;background:' + (col.bgColor || 'transparent') +
                                    ';box-sizing:border-box;min-height:20px;position:relative;display:flex;flex-direction:column;flex:1 1 0;">';
                                for (const child of (col.children || [])) {
                                    html += exportElementToHTML(child);
                                }
                                html += '</div>';
                            }
                            html += '</div>';
                        }
                        html += '</div>';
                        return html;
                    }
                    case 'dynamic-box': {
                        let html =
                            '<div style="padding:6px;background:#1a2a2a;border:1px dashed #3a5a5a;border-radius:3px;margin:2px 0;">';
                        html += '<div style="font-size:10px;color:#5a8a8a;">Dynamic: ' + (el.id || '') + '</div>';
                        if (el.defaultPackage) {
                            const pkg = state.packages.find(p => p.id === el.defaultPackage);
                            if (pkg) {
                                for (const e of pkg.elements) {
                                    html += exportElementToHTML(e);
                                }
                            }
                        }
                        html += '</div>';
                        return html;
                    }
                    case 'text': {
                        let textAlign = el.textAlign || 'left';
                        let anchor = el.anchor || 'tl';
                        const styles = getAnchorStyles(anchor);
                        return '<div style="display:flex;width:100%;height:100%;justify-content:' + styles
                            .justifyContent + ';align-items:' + styles.alignItems +
                            ';"><div style="font-family:' + (el.fontFamily || 'Inter') + ';font-size:' + (el
                                .fontSize || 16) + 'px;color:' + (el.color || '#e0e0e0') + ';font-weight:' + (el
                                .fontWeight || '400') + ';font-style:' + (el.fontStyle || 'normal') +
                            ';text-decoration:' + (el.textDecoration || 'none') + ';text-align:' + textAlign +
                            ';letter-spacing:' + (el.letterSpacing || 0) + 'px;line-height:' + (el.lineHeight ||
                                1.5) + ';padding:2px 4px;">' + (el.content || 'Text') + '</div></div>';
                    }
                    case 'media': {
                        const anchor = el.anchor || 'tl';
                        const styles = getAnchorStyles(anchor);
                        const sizeAdj = el.sizeAdjust || 0;
                        const scaleFactor = 1 + (sizeAdj / 100);
                        const style = 'display:block;transform:scale(' + scaleFactor +
                            ');transform-origin:center center;max-width:100%;height:auto;width:' + (el.width ||
                                'auto') + ';height:' + (el.height || 'auto') + ';margin:' + (el.margin || 0) +
                            'px;border-radius:' + (el.cornerRadius || 0) + 'px;object-fit:' + (el.fit ===
                                'crop' ? 'cover' : 'contain') + ';';
                        const wrapStyle = 'display:flex;width:100%;height:100%;justify-content:' + styles
                            .justifyContent + ';align-items:' + styles.alignItems + ';';
                        if (el.mediaType === 'video') {
                            return '<div style="' + wrapStyle + '"><video src="' + (el.src || '') + '" poster="' + (
                                el.poster || '') + '" controls style="' + style + '"></video></div>';
                        } else {
                            return '<div style="' + wrapStyle + '"><img src="' + (el.src || '') + '" alt="' + (el
                                    .alt || '') + '" style="' + style + '" /></div>';
                        }
                    }
                    case 'media-grid': {
                        let html = '<div style="display:' + (el.layout === 'masonry' ? 'block' : 'grid') +
                            ';grid-template-columns:repeat(' + (el.gridCols || 3) + ',1fr);gap:4px;' + (el
                                .layout === 'masonry' ? 'column-count:3;' : '') + '">';
                        for (const item of (el.items || [])) {
                            html += '<div style="margin:' + (el.margin || 0) + 'px;border-radius:' + (el
                                    .cornerRadius || 0) + 'px;overflow:hidden;' + (el.layout === 'masonry' ?
                                    'break-inside:avoid;margin-bottom:4px;' : '') + '">';
                            if (item.mediaType === 'video') {
                                html += '<video src="' + (item.src || '') + '" poster="' + (item.poster || '') +
                                    '" controls style="width:100%;display:block;object-fit:' + (el.fit ===
                                        'crop' ? 'cover' : 'contain') + ';' + (el.fit === 'crop' ?
                                        'height:120px;' : '') + '"></video>';
                            } else {
                                html += '<img src="' + (item.src || '') + '" alt="' + (item.alt || '') +
                                    '" style="width:100%;display:block;object-fit:' + (el.fit === 'crop' ?
                                        'cover' : 'contain') + ';' + (el.fit === 'crop' ? 'height:120px;' :
                                        '') + '" />';
                            }
                            html += '</div>';
                        }
                        html += '</div>';
                        return html;
                    }
                    case 'button': {
                        const anchor = el.anchor || 'tl';
                        const styles = getAnchorStyles(anchor);
                        const action = el.action || 'link';
                        const dataAttrs = ' data-action="' + action + '" data-url="' + (el.actionUrl || '#') +
                            '" data-target="' + (el.actionTarget || '_blank') + '" data-canvas="' + (el
                                .actionCanvas || '') + '" data-dynamic-box="' + (el.actionDynamicBox || '') +
                            '" data-package="' + (el.actionPackage || '') + '"';
                        let style = 'border-radius:' + (el.cornerRadius || 4) + 'px;background:' + (el.bgColor ||
                            '#2a5a8a') + ';color:' + (el.color || '#ffffff') + ';border:' + (el.borderSize || 0) +
                            'px solid ' + (el.borderColor || 'transparent') +
                            ';padding:4px 12px;cursor:pointer;font-size:' + (el.fontSize || 13) +
                            'px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-height:30px;min-width:30px;';
                        if (el.autoWidth !== false) {
                            style += 'width:auto;';
                        } else if (el.width) {
                            style += 'width:' + el.width + ';';
                        }
                        if (el.height) style += 'height:' + el.height + ';';
                        const wrapStyle = 'display:flex;width:100%;height:100%;justify-content:' + styles
                            .justifyContent + ';align-items:' + styles.alignItems + ';';

                        let contentHtml = '';
                        if (el.children && el.children.length > 0) {
                            for (const child of el.children) {
                                contentHtml += exportElementToHTML(child);
                            }
                        } else {
                            contentHtml = '<span style="color:inherit;font-size:inherit;">' + (el.label ||
                                'Button') + '</span>';
                        }

                        return '<div style="' + wrapStyle + '"><button class="el-button" style="' + style + '"' +
                            dataAttrs +
                            '><div class="btn-content" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;pointer-events:none;">' +
                            contentHtml + '</div></button></div>';
                    }
                    default:
                        return '<div>Unknown</div>';
                }
            }

            // Helper for export
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

            document.getElementById('btn-preview').addEventListener('click', () => {
                const canvas = state.canvases.find(c => c.isMain) || state.canvases[0];
                if (canvas) showPreviewCanvas(canvas);
            });
            document.getElementById('preview-close').addEventListener('click', () => {
                document.getElementById('preview-overlay').classList.remove('active');
            });
            document.getElementById('preview-overlay').addEventListener('click', (e) => {
                if (e.target === e.currentTarget) {
                    document.getElementById('preview-overlay').classList.remove('active');
                }
            });

            document.getElementById('dev-desktop').addEventListener('click', () => { state.deviceMode = 'desktop';
                renderCanvases();
                updateToolbarState(); });
            document.getElementById('dev-tablet').addEventListener('click', () => { state.deviceMode = 'tablet';
                renderCanvases();
                updateToolbarState(); });
            document.getElementById('dev-phone').addEventListener('click', () => { state.deviceMode = 'phone';
                renderCanvases();
                updateToolbarState(); });

            document.getElementById('btn-add-canvas').addEventListener('click', () => {
                const name = prompt('Canvas name:', 'canvas-' + (state.canvases.length + 1));
                if (name) {
                    const c = createCanvas(name, 1200, 800, 'page', false);
                    state.canvases.push(c);
                    state.selectedCanvasId = c.id;
                    renderAll();
                    pushHistory();
                }
            });

            document.getElementById('btn-add-package').addEventListener('click', () => {
                const name = prompt('Package name:', 'package-' + (state.packages.length + 1));
                if (name) {
                    state.packages.push({ id: uid(), name: name, elements: [] });
                    renderAll();
                    pushHistory();
                }
            });

            document.getElementById('btn-style-new').addEventListener('click', () => {
                const name = prompt('Style name:');
                if (name && !state.styles[name]) {
                    state.styles[name] = { css: '' };
                    const sel = document.getElementById('style-selector');
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    sel.appendChild(opt);
                    sel.value = name;
                } else if (name) {
                    alert('Style already exists.');
                }
            });

            document.getElementById('style-selector').addEventListener('change', function() {
                const name = this.value;
                if (name && state.styles[name]) {
                    alert('Style "' + name + '" selected. Apply it via element properties panel.');
                }
            });

            document.getElementById('btn-asset-file').addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*,video/*,font/*';
                input.multiple = true;
                input.onchange = () => {
                    for (const file of input.files) {
                        addAssetFile(file);
                    }
                };
                input.click();
            });

            document.getElementById('btn-asset-link').addEventListener('click', addAssetLink);

            const assetsPanel = document.getElementById('panel-assets');
            const assetsBody = assetsPanel.querySelector('.panel-body');
            assetsBody.addEventListener('dragover', (e) => {
                e.preventDefault();
                assetsBody.style.border = '1px dashed #4a8ac4';
            });
            assetsBody.addEventListener('dragleave', () => {
                assetsBody.style.border = 'none';
            });
            assetsBody.addEventListener('drop', (e) => {
                e.preventDefault();
                assetsBody.style.border = 'none';
                const files = e.dataTransfer.files;
                for (const file of files) {
                    if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith(
                            'font/')) {
                        addAssetFile(file);
                    }
                }
            });

            function openLightbox(src) {
                const lb = document.getElementById('lightbox');
                const img = document.getElementById('lightbox-img');
                img.src = src;
                lb.classList.add('active');
            }
            document.getElementById('lightbox').addEventListener('click', () => {
                document.getElementById('lightbox').classList.remove('active');
            });

            init();

            console.log('Page Builder ready.');
        })();