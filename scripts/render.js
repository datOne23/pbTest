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


