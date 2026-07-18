// Rendering functions for Page Builder

import { DEVICE_SCALES, ANCHOR_STYLES } from './constants.js';
import { 
    getState, findElement, getParentElement, getElementContainer, 
    getContainingLayer, uid, removeElement, findElementInArray,
    pushHistory, dataURLToBlob
} from './state.js';
import { createElement } from './elements.js';

let dragState = null;

export function getDeviceScale() {
    const state = getState();
    return DEVICE_SCALES[state.deviceMode] || 0.4;
}

export function getAnchorStyles(anchor) {
    return ANCHOR_STYLES[anchor] || ANCHOR_STYLES['tl'];
}

export function setupElementDrag(elDiv, el, renderCallbacks) {
    let holdTimer = null;
    let isHeld = false;
    let startX, startY;
    let hasMoved = false;

    elDiv.addEventListener('pointerdown', function(e) {
        if (e.button !== 0) return;
        if (e.target.closest('input') || e.target.closest('button') || e.target.closest('.btn-label') || e.target.closest('.el-text')) return;
        const layer = getContainingLayer(el.id);
        if (layer && layer.locked) return;

        startX = e.clientX;
        startY = e.clientY;
        hasMoved = false;
        isHeld = false;

        holdTimer = setTimeout(() => {
            isHeld = true;
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

        const elUnder = document.elementFromPoint(e.clientX, e.clientY);
        let target = null;
        let position = 'inside';

        if (elUnder) {
            const targetEl = elUnder.closest('.el-box, .el-text, .el-media, .el-media-grid, .el-button-container, .el-dynamic-box, .el-col, .layer-drop-zone');
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

        document.querySelectorAll('.drop-target-before, .drop-target-after, .drag-over-target').forEach(el => {
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

            document.querySelectorAll('.drop-target-before, .drop-target-after, .drag-over-target').forEach(el => {
                el.classList.remove('drop-target-before', 'drop-target-after', 'drag-over-target');
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
                    const state = getState();
                    const canvas = state.canvases.find(c => c.layers.some(l => l.elements.some(e => e.id === draggedEl.id)));
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
                        renderCallbacks.renderAll();
                        renderCallbacks.pushHistory();
                        renderCallbacks.selectElement(draggedEl.id);
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
                                renderCallbacks.renderAll();
                                renderCallbacks.pushHistory();
                                renderCallbacks.selectElement(draggedEl.id);
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
                    renderCallbacks.renderAll();
                    renderCallbacks.pushHistory();
                    renderCallbacks.selectElement(draggedEl.id);
                    dragState = null;
                    return;
                }
            }

            dragState = null;
        }
    }
}

export function showContextMenu(x, y, canvasId, elementId) {
    const contextMenu = document.getElementById('context-menu');
    if (!contextMenu) return;
    
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

export { setupElementDrag as default };
