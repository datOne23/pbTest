// render.js - Canvas and element rendering

function getDeviceScale() {
    switch (state.deviceMode) {
        case 'tablet': return 0.768;
        case 'phone': return 0.375;
        default: return 1;
    }
}

function getAnchorStyles(anchor) {
    const map = {
        'tl': { top: 0, left: 0, right: 'auto', bottom: 'auto', translate: 'none' },
        'tc': { top: 0, left: '50%', right: 'auto', bottom: 'auto', translate: 'translateX(-50%)' },
        'tr': { top: 0, left: 'auto', right: 0, bottom: 'auto', translate: 'none' },
        'cl': { top: '50%', left: 0, right: 'auto', bottom: 'auto', translate: 'translateY(-50%)' },
        'cc': { top: '50%', left: '50%', right: 'auto', bottom: 'auto', translate: 'translate(-50%, -50%)' },
        'cr': { top: '50%', left: 'auto', right: 0, bottom: 'auto', translate: 'translateY(-50%)' },
        'bl': { top: 'auto', left: 0, right: 'auto', bottom: 0, translate: 'none' },
        'bc': { top: 'auto', left: '50%', right: 'auto', bottom: 0, translate: 'translateX(-50%)' },
        'br': { top: 'auto', left: 'auto', right: 0, bottom: 0, translate: 'none' },
        'mc': { top: '50%', left: '50%', right: 'auto', bottom: 'auto', translate: 'translate(-50%, -50%)' },
    };
    return map[anchor] || map['tl'];
}

let dragState = null;

function setupElementDrag(elDiv, el) {
    let holdTimer = null;
    let isHeld = false;
    let startX, startY;
    let hasMoved = false;

    elDiv.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const layer = getContainingLayer(el.id);
        if (layer && layer.locked) return;

        holdTimer = setTimeout(() => {
            isHeld = true;
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;

            const rect = elDiv.getBoundingClientRect();
            const clone = elDiv.cloneNode(true);
            clone.classList.add('element-dragging');
            clone.style.position = 'fixed';
            clone.style.width = rect.width + 'px';
            clone.style.height = rect.height + 'px';
            clone.style.left = rect.left + 'px';
            clone.style.top = rect.top + 'px';
            clone.style.pointerEvents = 'none';
            clone.style.zIndex = '9999';
            document.body.appendChild(clone);

            dragState = {
                element: el,
                clone: clone,
                offsetX: e.clientX - rect.left,
                offsetY: e.clientY - rect.top,
                target: null,
                position: 'inside',
            };
        }, 150);
    });

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd, { once: true });

    function onDragMove(e) {
        if (!isHeld || !dragState) return;
        hasMoved = true;

        const x = e.clientX - dragState.offsetX;
        const y = e.clientY - dragState.offsetY;
        dragState.clone.style.left = x + 'px';
        dragState.clone.style.top = y + 'px';

        const elUnder = document.elementFromPoint(e.clientX, e.clientY);
        let target = null;
        let position = 'inside';

        if (elUnder) {
            const targetEl = elUnder.closest('.el-box, .el-text, .el-media, .el-button-container, .el-col');
            if (targetEl && targetEl.dataset.elId) {
                const rect = targetEl.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                position = e.clientY < midY ? 'before' : 'after';

                const layerZone = elUnder.closest('.layer-drop-zone');
                if (layerZone) {
                    target = layerZone;
                    position = 'inside';
                } else {
                    target = targetEl;
                }
            } else {
                const layerZone = elUnder.closest('.layer-drop-zone');
                if (layerZone) {
                    target = layerZone;
                    position = 'inside';
                }
            }
        }

        document.querySelectorAll('.layer-drop-zone.drag-over, .el-box.drag-over-before, .el-box.drag-over-after').forEach(z => {
            z.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
        });

        if (target) {
            if (position === 'inside') {
                target.classList.add('drag-over');
            } else {
                target.classList.add('drag-over-' + position);
            }
        }

        dragState.target = target;
        dragState.position = position;
    }

    function onDragEnd(e) {
        clearTimeout(holdTimer);
        if (dragState && dragState.clone) {
            dragState.clone.remove();
        }

        document.querySelectorAll('.layer-drop-zone.drag-over, .el-box.drag-over-before, .el-box.drag-over-after').forEach(z => {
            z.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
        });

        if (isHeld && hasMoved && dragState) {
            const target = dragState.target;
            const position = dragState.position;
            const draggedEl = dragState.element;

            if (target) {
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
                        if (layer) {
                            targetContainer = layer.elements;
                            targetIdx = targetContainer.length;
                            isLayerDrop = true;
                        }
                    }
                } else if (target.dataset.colId) {
                    const col = findElement(parseInt(target.dataset.colId));
                    if (col) {
                        const colContainer = col.children;
                        const idx = container.indexOf(draggedEl);
                        if (idx !== -1) {
                            container.splice(idx, 1);
                        }
                        colContainer.push(draggedEl);
                        renderAll();
                        pushHistory();
                        dragState = null;
                        return;
                    }
                } else {
                    const targetElId = parseInt(target.dataset.elId);
                    if (targetElId) {
                        const targetContainer = getElementContainer(targetElId);
                        if (targetContainer) {
                            const tIdx = targetContainer.findIndex(e => e.id === targetElId);
                            if (tIdx !== -1) {
                                const idx = container.indexOf(draggedEl);
                                if (idx !== -1) {
                                    container.splice(idx, 1);
                                }
                                const insertIdx = position === 'before' ? tIdx : tIdx + 1;
                                targetContainer.splice(insertIdx, 0, draggedEl);
                                renderAll();
                                pushHistory();
                                dragState = null;
                                return;
                            }
                        }
                    }
                }

                if (isLayerDrop && targetContainer) {
                    const idx = container.indexOf(draggedEl);
                    if (idx !== -1) {
                        container.splice(idx, 1);
                    }
                    targetContainer.push(draggedEl);
                    renderAll();
                    pushHistory();
                }
            }
        }

        dragState = null;
        isHeld = false;
        hasMoved = false;
    }
}

function renderElement(el, scale) {
    const div = document.createElement('div');
    div.className = 'el-' + el.type;
    div.dataset.elId = el.id;

    const applyMarginPadding = (el, div) => {
        let margin = el.margin !== undefined ? el.margin : 0;
        let padding = el.padding !== undefined ? el.padding : 0;

        if (el.customMargin) {
            const t = (el.marginTop || 0) * scale;
            const r = (el.marginRight || 0) * scale;
            const b = (el.marginBottom || 0) * scale;
            const l = (el.marginLeft || 0) * scale;
            div.style.margin = t + 'px ' + r + 'px ' + b + 'px ' + l + 'px';
        } else {
            div.style.margin = (margin * scale) + 'px';
        }

        if (el.customPadding) {
            const t = (el.paddingTop || 0) * scale;
            const r = (el.paddingRight || 0) * scale;
            const b = (el.paddingBottom || 0) * scale;
            const l = (el.paddingLeft || 0) * scale;
            div.style.padding = t + 'px ' + r + 'px ' + b + 'px ' + l + 'px';
        } else {
            div.style.padding = (padding * scale) + 'px';
        }
    };

    const s = el.styles || {};
    for (const [k, v] of Object.entries(s)) {
        div.style[k] = v;
    }

    const parent = getParentElement(el.id);
    const isInsideColumn = parent && parent.type === 'column';
    const anchor = (isInsideColumn && el.anchor) ? el.anchor : 'tl';
    const anchorStyles = getAnchorStyles(anchor);

    if (el.type === 'box') {
        const border = (el.borderSize || 0) * scale;
        const borderOpacity = el.borderOpacity !== undefined ? el.borderOpacity / 100 : 1;
        let borderColor = el.borderColor || 'transparent';
        if (borderColor.startsWith('#') && borderColor.length === 7) {
            const temp = document.createElement('div');
            temp.style.color = borderColor;
            const computed = temp.style.color;
            if (computed.startsWith('rgb')) {
                const rgb = computed.match(/\d+/g);
                if (rgb) {
                    borderColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${borderOpacity})`;
                }
            } else {
                const r = parseInt(borderColor.slice(1, 3), 16);
                const g = parseInt(borderColor.slice(3, 5), 16);
                const b = parseInt(borderColor.slice(5, 7), 16);
                borderColor = `rgba(${r}, ${g}, ${b}, ${borderOpacity})`;
            }
        }

        const rows = el.gridRows || 1;
        const cols = el.gridCols || 1;

        const gridContainer = document.createElement('div');
        gridContainer.className = 'el-grid';
        gridContainer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        gridContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        gridContainer.style.gap = '4px';
        div.appendChild(gridContainer);

        const children = el.children || [];
        const rowProportions = el.rowProportions || [];

        for (let r = 0; r < rows; r++) {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'el-row';
            gridContainer.appendChild(rowDiv);

            const rowProps = (rowProportions && rowProportions[r]) ? rowProportions[r] : [];

            for (let c = 0; c < cols; c++) {
                const colIdx = r * cols + c;
                const col = children[colIdx] || {
                    id: uid(),
                    type: 'column',
                    children: [],
                    widthPct: 100 / cols,
                };

                const colDiv = document.createElement('div');
                colDiv.className = 'el-col';
                colDiv.dataset.colId = col.id;
                colDiv.dataset.elId = col.id;

                if (rowProps && rowProps[c]) {
                    colDiv.style.flex = rowProps[c] + ' ' + rowProps[c] + ' 0';
                }

                for (const child of (col.children || [])) {
                    const node = renderElement(child, scale);
                    colDiv.appendChild(node);
                }

                rowDiv.appendChild(colDiv);
            }
        }

        div.addEventListener('dragover', (e) => {
            e.preventDefault();
            const boxLayer = getContainingLayer(el.id);
            if (boxLayer && boxLayer.locked) return;

            const data = e.dataTransfer.getData('text/plain');
            if (data.startsWith('asset:')) {
                e.dataTransfer.dropEffect = 'copy';
            } else {
                e.dataTransfer.dropEffect = 'move';
            }
        });

        div.addEventListener('drop', (e) => {
            e.preventDefault();
            const boxLayer = getContainingLayer(el.id);
            if (boxLayer && boxLayer.locked) return;

            const data = e.dataTransfer.getData('text/plain');
            if (data.startsWith('el:')) {
                const elId = parseInt(data.substring(3));
                const draggedEl = findElement(elId);
                if (draggedEl) {
                    const oldContainer = getElementContainer(elId);
                    if (oldContainer) {
                        const idx = oldContainer.findIndex(e => e.id === elId);
                        if (idx !== -1) {
                            oldContainer.splice(idx, 1);
                        }
                    }
                    if (el.children && el.children.length > 0) {
                        el.children[0].children.push(draggedEl);
                    }
                    renderAll();
                    pushHistory();
                }
            } else if (data.startsWith('asset:')) {
                const assetId = parseInt(data.substring(6));
                const newEl = createElement('media');
                newEl.assetId = assetId;
                const asset = state.assets.find(a => a.id === assetId);
                if (asset) {
                    newEl.src = asset.url;
                    newEl.mediaType = asset.type;
                }
                if (el.children && el.children.length > 0) {
                    el.children[0].children.push(newEl);
                }
                renderAll();
                pushHistory();
            } else {
                const type = data;
                const newEl = createElement(type);
                if (el.children && el.children.length > 0) {
                    el.children[0].children.push(newEl);
                }
                renderAll();
                pushHistory();
            }
        });
    }

    div.style.opacity = (el.opacity / 100);
    return div;
}
