// Main application logic for Page Builder

import { FONT_LIST, ANCHOR_STYLES, DEVICE_SCALES } from './constants.js';
import { 
    getState, getHistory, setHistory, pushHistory, restoreSnapshot, 
    undo as undoState, redo as redoState, uid, dataURLToBlob,
    findCanvas, findElement, findElementInArray, getParentCanvas, 
    getParentPackage, getParentElement, getParentInArray, 
    getElementContainer, getContainingLayer, removeElement,
    bringToFront, sendToBack, bringForward, sendBackward
} from './state.js';
import { createElement, createCanvas, showCanvasInBuffer, handleButtonAction, updateBoxColumns } from './elements.js';
import { getDeviceScale, getAnchorStyles, setupElementDrag, showContextMenu } from './render.js';

let dragState = null;
let isResizing = false;
let resizeHandle = null;
let resizeStartX, resizeStartY;
let resizeOriginalWidth, resizeOriginalHeight;
let resizeEl = null;

export function init() {
    const state = getState();
    
    // Initialize font list in style selector if needed
    populateStyleSelector();
    
    // Initial render
    renderAll();
    pushHistory();
    
    setupEventListeners();
}

function populateStyleSelector() {
    const sel = document.getElementById('style-selector');
    if (!sel) return;
    // Styles will be populated dynamically
}

export function renderAll() {
    renderCanvases();
    renderLayersPanel();
    renderPackages();
    renderProperties();
    renderAssets();
    updateToolbarState();
}

export function renderAssets() {
    const state = getState();
    const container = document.getElementById('asset-items-container');
    if (!container) return;
    container.innerHTML = '';
    for (const asset of state.assets) {
        const div = document.createElement('div');
        div.className = 'asset-item';
        div.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px;border:1px solid #333;border-radius:3px;margin-bottom:4px;';
        
        let thumb = '';
        if (asset.type.startsWith('image/')) {
            thumb = '<img src="' + asset.url + '" style="width:32px;height:32px;object-fit:cover;border-radius:2px;" />';
        } else if (asset.type.startsWith('video/')) {
            thumb = '<div style="width:32px;height:32px;background:#333;border-radius:2px;display:flex;align-items:center;justify-content:center;">🎬</div>';
        } else {
            thumb = '<div style="width:32px;height:32px;background:#333;border-radius:2px;display:flex;align-items:center;justify-content:center;">📄</div>';
        }
        
        div.innerHTML = thumb + '<span style="font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + asset.name + '</span>' +
            '<button class="btn-use-asset" data-id="' + asset.id + '">Use</button>' +
            '<button class="btn-delete-asset" data-id="' + asset.id + '">🗑</button>';
        
        container.appendChild(div);
    }
    
    // Attach event listeners
    container.querySelectorAll('.btn-use-asset').forEach(btn => {
        btn.addEventListener('click', () => {
            const assetId = parseInt(btn.dataset.id);
            const elId = getState().selectedElementId;
            if (elId) {
                const el = findElement(elId);
                if (el && (el.type === 'media' || el.type === 'media-grid')) {
                    handleAssetDrop(el, assetId);
                    renderAll();
                    pushHistory();
                }
            }
        });
    });
    
    container.querySelectorAll('.btn-delete-asset').forEach(btn => {
        btn.addEventListener('click', () => {
            const assetId = parseInt(btn.dataset.id);
            deleteAsset(assetId);
        });
    });
}

export function addAssetFile(file) {
    const state = getState();
    const reader = new FileReader();
    reader.onload = () => {
        const dataUrl = reader.result;
        const blob = dataURLToBlob(dataUrl);
        const url = URL.createObjectURL(blob);
        const asset = {
            id: uid(),
            name: file.name,
            type: file.type,
            data: dataUrl,
            url: url
        };
        state.assets.push(asset);
        state.assetBlobMap[asset.id] = url;
        renderAssets();
        pushHistory();
    };
    reader.readAsDataURL(file);
}

export function addAssetLink() {
    const url = prompt('Enter asset URL:');
    if (!url) return;
    const name = prompt('Asset name:', url.split('/').pop());
    if (!name) return;
    const state = getState();
    const type = guessTypeFromUrl(url);
    const asset = {
        id: uid(),
        name: name,
        type: type,
        data: url,
        url: url
    };
    state.assets.push(asset);
    renderAssets();
    pushHistory();
}

function guessTypeFromUrl(url) {
    if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url)) return 'image/*';
    if (/\.(mp4|webm|ogg)$/i.test(url)) return 'video/*';
    if (/\.(woff|woff2|ttf|otf|eot)$/i.test(url)) return 'font/*';
    return 'application/octet-stream';
}

export function handleAssetDrop(el, assetId) {
    const state = getState();
    const asset = state.assets.find(a => a.id === assetId);
    if (!asset) return;
    
    if (el.type === 'media') {
        el.src = asset.url;
        el.assetId = asset.id;
        if (asset.type.startsWith('video/')) {
            el.mediaType = 'video';
        } else {
            el.mediaType = 'image';
        }
    } else if (el.type === 'media-grid') {
        el.items.push({
            src: asset.url,
            alt: asset.name,
            mediaType: asset.type.startsWith('video/') ? 'video' : 'image',
            poster: '',
            assetId: asset.id
        });
    }
}

function deleteAsset(assetId) {
    const state = getState();
    const idx = state.assets.findIndex(a => a.id === assetId);
    if (idx === -1) return;
    const asset = state.assets[idx];
    if (asset.url && asset.url.startsWith('blob:')) {
        URL.revokeObjectURL(asset.url);
    }
    state.assets.splice(idx, 1);
    delete state.assetBlobMap[assetId];
    renderAssets();
    pushHistory();
}

export function renderCanvases() {
    const state = getState();
    const scroll = document.getElementById('canvas-scroll');
    if (!scroll) return;
    scroll.innerHTML = '';
    
    const scale = getDeviceScale();
    
    for (const canvas of state.canvases) {
        const cDiv = document.createElement('div');
        cDiv.className = 'canvas-wrapper';
        cDiv.style.cssText = 'position:relative;margin:20px auto;';
        cDiv.dataset.canvasId = canvas.id;
        
        const w = canvas.width * scale;
        const h = canvas.height * scale;
        
        cDiv.style.width = w + 'px';
        cDiv.style.height = h + 'px';
        
        const canvasEl = document.createElement('div');
        canvasEl.className = 'canvas-el' + (canvas.isMain ? ' main-canvas' : '');
        canvasEl.style.cssText = 'position:absolute;top:0;left:0;width:' + w + 'px;height:' + h + 'px;background:' + canvas.bgColor + ';overflow:hidden;';
        canvasEl.dataset.canvasId = canvas.id;
        
        // Render layers
        for (const layer of canvas.layers) {
            if (layer.isBuffer) continue; // Buffer is only for preview
            
            const layerDiv = document.createElement('div');
            layerDiv.className = 'layer-drop-zone';
            layerDiv.dataset.layerId = layer.id;
            layerDiv.dataset.canvasId = canvas.id;
            layerDiv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
            
            // Render elements
            for (const el of layer.elements) {
                const elDiv = renderElement(el, scale);
                if (elDiv) layerDiv.appendChild(elDiv);
            }
            
            canvasEl.appendChild(layerDiv);
        }
        
        cDiv.appendChild(canvasEl);
        scroll.appendChild(cDiv);
        
        // Canvas click to select
        canvasEl.addEventListener('click', (e) => {
            e.stopPropagation();
            state.selectedCanvasId = canvas.id;
            state.selectedElementId = null;
            renderAll();
        });
        
        // Context menu on canvas
        canvasEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e.clientX, e.clientY, canvas.id, null);
        });
    }
    
    applyZoomPan();
}

export function renderElement(el, scale) {
    if (!el) return null;
    
    const state = getState();
    const div = document.createElement('div');
    div.className = 'el-' + el.type;
    div.dataset.elId = el.id;
    
    const baseStyle = 'position:absolute;left:' + (el.x || 0) + 'px;top:' + (el.y || 0) + 'px;width:' + (el.w || 100) + 'px;height:' + (el.h || 50) + 'px;';
    const opacityStyle = 'opacity:' + (el.opacity / 100) + ';';
    div.style.cssText = baseStyle + opacityStyle;
    
    // Selection handling
    div.addEventListener('click', (e) => {
        e.stopPropagation();
        state.selectedElementId = el.id;
        renderAll();
    });
    
    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, null, el.id);
    });
    
    // Setup drag
    setupElementDrag(div, el, { renderAll, pushHistory, selectElement });
    
    switch (el.type) {
        case 'box':
            div.style.background = el.bgColor || 'transparent';
            div.style.border = el.borderSize + 'px ' + el.borderStyle + ' ' + (el.borderColor || 'transparent');
            div.style.borderOpacity = el.borderOpacity / 100;
            div.style.padding = el.padding + 'px';
            
            const grid = document.createElement('div');
            grid.className = 'el-grid';
            grid.style.cssText = 'display:flex;flex-direction:column;gap:4px;width:100%;height:100%;';
            
            for (let r = 0; r < el.gridRows; r++) {
                const row = document.createElement('div');
                row.className = 'el-row';
                row.style.cssText = 'display:flex;gap:4px;width:100%;flex:1 1 auto;';
                
                for (let c = 0; c < el.gridCols; c++) {
                    const colIdx = r * el.gridCols + c;
                    const col = el.children[colIdx];
                    if (col) {
                        const colDiv = document.createElement('div');
                        colDiv.className = 'el-col';
                        colDiv.dataset.elId = col.id;
                        colDiv.style.cssText = 'background:rgba(255,255,255,0.05);border-radius:2px;padding:4px;min-height:20px;position:relative;display:flex;flex-direction:column;flex:1 1 0;';
                        
                        // Render children in column
                        for (const child of col.children) {
                            const childDiv = renderElement(child, scale);
                            if (childDiv) colDiv.appendChild(childDiv);
                        }
                        
                        // Column selection
                        colDiv.addEventListener('click', (e) => {
                            e.stopPropagation();
                            state.selectedElementId = col.id;
                            renderAll();
                        });
                        
                        row.appendChild(colDiv);
                    }
                }
                grid.appendChild(row);
            }
            div.appendChild(grid);
            break;
            
        case 'dynamic-box':
            div.style.background = '#1a3a5a';
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'center';
            div.innerHTML = '<span style="color:#fff;font-size:12px;">Dynamic: ' + (el.defaultPackage ? 'Linked' : 'Empty') + '</span>';
            break;
            
        case 'text':
            div.className = 'el-text';
            div.style.cssText += 'font-family:' + el.fontFamily + ';font-size:' + el.fontSize + 'px;color:' + el.color + ';font-weight:' + el.fontWeight + ';font-style:' + el.fontStyle + ';text-decoration:' + el.textDecoration + ';text-align:' + el.textAlign + ';letter-spacing:' + el.letterSpacing + 'px;line-height:' + el.lineHeight + ';padding:4px;';
            if (el.highlight) {
                div.innerHTML = '<span style="background:' + el.highlight + ';">' + el.content + '</span>';
            } else {
                div.textContent = el.content;
            }
            div.contentEditable = 'true';
            div.addEventListener('input', () => {
                el.content = div.textContent;
                pushHistory();
            });
            break;
            
        case 'media':
            div.style.overflow = 'hidden';
            if (el.mediaType === 'video') {
                div.innerHTML = '<video src="' + el.src + '" poster="' + el.poster + '" controls style="width:100%;height:100%;object-fit:' + (el.fit === 'crop' ? 'cover' : 'contain') + ';"></video>';
            } else {
                div.innerHTML = '<img src="' + el.src + '" alt="' + el.alt + '" style="width:100%;height:100%;object-fit:' + (el.fit === 'crop' ? 'cover' : 'contain') + ';" />';
            }
            break;
            
        case 'media-grid':
            const layout = el.layout === 'masonry' ? 'block' : 'grid';
            const gridCols = el.gridCols || 3;
            div.style.cssText += 'display:' + layout + ';grid-template-columns:repeat(' + gridCols + ',1fr);gap:4px;';
            if (el.layout === 'masonry') {
                div.style.columnCount = '3';
            }
            
            for (const item of (el.items || [])) {
                const itemDiv = document.createElement('div');
                itemDiv.style.cssText = 'margin:' + (el.margin || 0) + 'px;border-radius:' + (el.cornerRadius || 0) + 'px;overflow:hidden;';
                if (el.layout === 'masonry') {
                    itemDiv.style.breakInside = 'avoid';
                    itemDiv.style.marginBottom = '4px';
                }
                
                if (item.mediaType === 'video') {
                    itemDiv.innerHTML = '<video src="' + item.src + '" poster="' + item.poster + '" controls style="width:100%;display:block;object-fit:' + (el.fit === 'crop' ? 'cover' : 'contain') + ';"></video>';
                } else {
                    itemDiv.innerHTML = '<img src="' + item.src + '" alt="' + item.alt + '" style="width:100%;display:block;object-fit:' + (el.fit === 'crop' ? 'cover' : 'contain') + ';" />';
                }
                div.appendChild(itemDiv);
            }
            break;
            
        case 'button':
            const anchor = el.anchor || 'tl';
            const styles = getAnchorStyles(anchor);
            div.style.cssText += 'display:flex;width:100%;height:100%;justify-content:' + styles.justifyContent + ';align-items:' + styles.alignItems + ';';
            
            const btn = document.createElement('button');
            btn.className = 'el-button';
            let btnStyle = 'border-radius:' + (el.cornerRadius || 4) + 'px;background:' + (el.bgColor || '#2a5a8a') + ';color:' + (el.color || '#ffffff') + ';border:' + (el.borderSize || 0) + 'px solid ' + (el.borderColor || 'transparent') + ';padding:4px 12px;cursor:pointer;font-size:' + (el.fontSize || 13) + 'px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-height:30px;min-width:30px;';
            if (el.autoWidth !== false) {
                btnStyle += 'width:auto;';
            } else if (el.width) {
                btnStyle += 'width:' + el.width + ';';
            }
            if (el.height) btnStyle += 'height:' + el.height + ';';
            btn.style.cssText = btnStyle;
            
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleButtonClick(el);
            });
            
            const btnContent = document.createElement('div');
            btnContent.className = 'btn-content';
            btnContent.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;pointer-events:none;';
            
            if (el.children && el.children.length > 0) {
                for (const child of el.children) {
                    const childDiv = renderElement(child, scale);
                    if (childDiv) btnContent.appendChild(childDiv);
                }
            } else {
                btnContent.innerHTML = '<span style="color:inherit;font-size:inherit;">' + (el.label || 'Button') + '</span>';
            }
            
            btn.appendChild(btnContent);
            div.appendChild(btn);
            break;
            
        case 'column':
            div.style.background = 'rgba(255,255,255,0.05)';
            div.style.borderRadius = '2px';
            div.style.padding = '4px';
            div.style.minHeight = '20px';
            div.style.position = 'relative';
            div.style.display = 'flex';
            div.style.flexDirection = 'column';
            div.style.flex = '1 1 0';
            
            for (const child of el.children) {
                const childDiv = renderElement(child, scale);
                if (childDiv) div.appendChild(childDiv);
            }
            break;
    }
    
    return div;
}

function handleButtonClick(el) {
    const state = getState();
    handleButtonAction(el, state, findElement, getParentCanvas, findElementInArray, renderAll, pushHistory);
}

export function renderLayersPanel() {
    const state = getState();
    const container = document.getElementById('layers-list');
    if (!container) return;
    container.innerHTML = '';
    
    const canvas = state.canvases.find(c => c.id === state.selectedCanvasId);
    if (!canvas) {
        container.innerHTML = '<div class="text-muted">Select a canvas</div>';
        return;
    }
    
    for (const layer of canvas.layers) {
        if (layer.isBuffer) continue;
        
        const lDiv = document.createElement('div');
        lDiv.className = 'layer-item' + (canvas.selectedLayerId === layer.id ? ' selected' : '');
        lDiv.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px;border:1px solid #333;border-radius:3px;margin-bottom:4px;cursor:pointer;';
        if (layer.locked) lDiv.style.opacity = '0.5';
        
        lDiv.innerHTML = '<span style="font-size:11px;flex:1;">' + layer.name + '</span>' +
            '<button class="btn-layer-lock" data-id="' + layer.id + '">' + (layer.locked ? '🔒' : '🔓') + '</button>' +
            '<button class="btn-layer-delete" data-id="' + layer.id + '">🗑</button>';
        
        lDiv.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            canvas.selectedLayerId = layer.id;
            renderLayersPanel();
            renderCanvases();
        });
        
        container.appendChild(lDiv);
    }
    
    // Add layer button
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add Layer';
    addBtn.style.cssText = 'width:100%;margin-top:8px;';
    addBtn.addEventListener('click', () => {
        const name = prompt('Layer name:', 'Layer ' + (canvas.layers.length));
        if (name) {
            canvas.layers.splice(canvas.layers.length - 1, 0, {
                id: uid(),
                name: name,
                elements: [],
                locked: false
            });
            canvas.selectedLayerId = canvas.layers[canvas.layers.length - 2].id;
            renderAll();
            pushHistory();
        }
    });
    container.appendChild(addBtn);
    
    // Attach lock/delete handlers
    container.querySelectorAll('.btn-layer-lock').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const layerId = parseInt(btn.dataset.id);
            const layer = canvas.layers.find(l => l.id === layerId);
            if (layer) {
                layer.locked = !layer.locked;
                renderAll();
                pushHistory();
            }
        });
    });
    
    container.querySelectorAll('.btn-layer-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const layerId = parseInt(btn.dataset.id);
            const idx = canvas.layers.findIndex(l => l.id === layerId);
            if (idx !== -1 && !canvas.layers[idx].isBuffer) {
                canvas.layers.splice(idx, 1);
                renderAll();
                pushHistory();
            }
        });
    });
}

export function renderPackages() {
    const state = getState();
    const container = document.getElementById('packages-list');
    if (!container) return;
    container.innerHTML = '';
    
    for (const pkg of state.packages) {
        const pDiv = document.createElement('div');
        pDiv.className = 'package-item';
        pDiv.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px;border:1px solid #333;border-radius:3px;margin-bottom:4px;';
        pDiv.innerHTML = '<span style="font-size:11px;flex:1;">' + pkg.name + '</span>' +
            '<button class="btn-delete-package" data-id="' + pkg.id + '">🗑</button>';
        
        pDiv.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            // Select package elements for editing
            if (pkg.elements.length > 0) {
                state.selectedElementId = pkg.elements[0].id;
                renderAll();
            }
        });
        
        container.appendChild(pDiv);
    }
    
    container.querySelectorAll('.btn-delete-package').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const pkgId = parseInt(btn.dataset.id);
            const idx = state.packages.findIndex(p => p.id === pkgId);
            if (idx !== -1) {
                state.packages.splice(idx, 1);
                renderAll();
                pushHistory();
            }
        });
    });
}

export function renderProperties() {
    const state = getState();
    const container = document.getElementById('properties-content');
    if (!container) return;
    
    const elId = state.selectedElementId;
    if (!elId) {
        container.innerHTML = '<div class="text-muted">Select an element to edit properties</div>';
        return;
    }
    
    const el = findElement(elId);
    if (!el) {
        container.innerHTML = '<div class="text-muted">Element not found</div>';
        return;
    }
    
    let html = '';
    
    // Common properties
    html += '<div class="prop-group"><label>X</label><input type="number" class="prop-x" value="' + (el.x || 0) + '" /></div>';
    html += '<div class="prop-group"><label>Y</label><input type="number" class="prop-y" value="' + (el.y || 0) + '" /></div>';
    html += '<div class="prop-group"><label>Width</label><input type="number" class="prop-w" value="' + (el.w || 100) + '" /></div>';
    html += '<div class="prop-group"><label>Height</label><input type="number" class="prop-h" value="' + (el.h || 50) + '" /></div>';
    html += '<div class="prop-group"><label>Opacity</label><input type="range" class="prop-opacity" min="0" max="100" value="' + (el.opacity || 100) + '" /><span class="prop-opacity-val">' + el.opacity + '%</span></div>';
    
    // Type-specific properties
    switch (el.type) {
        case 'text':
            html += '<div class="prop-group"><label>Content</label><textarea class="prop-content">' + el.content + '</textarea></div>';
            html += '<div class="prop-group"><label>Font Family</label><select class="prop-fontFamily">' + FONT_LIST.map(f => '<option value="' + f + '"' + (el.fontFamily === f ? ' selected' : '') + '>' + f + '</option>').join('') + '</select></div>';
            html += '<div class="prop-group"><label>Font Size</label><input type="number" class="prop-fontSize" value="' + el.fontSize + '" /></div>';
            html += '<div class="prop-group"><label>Color</label><input type="color" class="prop-color" value="' + el.color + '" /></div>';
            html += '<div class="prop-group"><label>Text Align</label><select class="prop-textAlign"><option value="left"' + (el.textAlign === 'left' ? ' selected' : '') + '>Left</option><option value="center"' + (el.textAlign === 'center' ? ' selected' : '') + '>Center</option><option value="right"' + (el.textAlign === 'right' ? ' selected' : '') + '>Right</option></select></div>';
            break;
            
        case 'media':
            html += '<div class="prop-group"><label>Source</label><input type="text" class="prop-src" value="' + el.src + '" /></div>';
            html += '<div class="prop-group"><label>Fit</label><select class="prop-fit"><option value="fit"' + (el.fit === 'fit' ? ' selected' : '') + '>Fit</option><option value="crop"' + (el.fit === 'crop' ? ' selected' : '') + '>Crop</option></select></div>';
            html += '<div class="prop-group"><label>Corner Radius</label><input type="number" class="prop-cornerRadius" value="' + el.cornerRadius + '" /></div>';
            break;
            
        case 'button':
            html += '<div class="prop-group"><label>Label</label><input type="text" class="prop-label" value="' + el.label + '" /></div>';
            html += '<div class="prop-group"><label>Action</label><select class="prop-action"><option value="link"' + (el.action === 'link' ? ' selected' : '') + '>Link</option><option value="page"' + (el.action === 'page' ? ' selected' : '') + '>Page</option><option value="dynamic"' + (el.action === 'dynamic' ? ' selected' : '') + '>Dynamic</option></select></div>';
            html += '<div class="prop-group"><label>Action URL</label><input type="text" class="prop-actionUrl" value="' + el.actionUrl + '" /></div>';
            html += '<div class="prop-group"><label>Background</label><input type="color" class="prop-bgColor" value="' + el.bgColor + '" /></div>';
            break;
            
        case 'box':
            html += '<div class="prop-group"><label>Background</label><input type="color" class="prop-bgColor" value="' + (el.bgColor === 'transparent' ? '#000000' : el.bgColor) + '" /></div>';
            html += '<div class="prop-group"><label>Padding</label><input type="number" class="prop-padding" value="' + el.padding + '" /></div>';
            html += '<div class="prop-group"><label>Grid Rows</label><input type="number" class="prop-gridRows" value="' + el.gridRows + '" /></div>';
            html += '<div class="prop-group"><label>Grid Cols</label><input type="number" class="prop-gridCols" value="' + el.gridCols + '" /></div>';
            break;
    }
    
    container.innerHTML = html;
    
    // Attach change handlers
    container.querySelectorAll('input, select, textarea').forEach(input => {
        input.addEventListener('change', () => {
            const cls = input.className;
            const prop = cls.replace('prop-', '');
            let val = input.value;
            if (input.type === 'number') val = parseFloat(val);
            if (prop === 'bgColor' && el.type === 'box' && input.value === '#000000' && el.bgColor === 'transparent') {
                // Keep transparent
            } else {
                el[prop] = val;
            }
            renderAll();
            pushHistory();
        });
        
        if (input.classList.contains('prop-opacity')) {
            input.addEventListener('input', () => {
                container.querySelector('.prop-opacity-val').textContent = input.value + '%';
            });
        }
    });
}

function setupEventListeners() {
    // Save/Open/Export buttons
    document.getElementById('btn-save')?.addEventListener('click', saveProject);
    document.getElementById('btn-open')?.addEventListener('click', openProject);
    document.getElementById('btn-export')?.addEventListener('click', exportHTML);
    document.getElementById('btn-export-zip')?.addEventListener('click', exportZIP);
    document.getElementById('btn-preview')?.addEventListener('click', showPreview);
    
    // Device buttons
    document.getElementById('dev-desktop')?.addEventListener('click', () => {
        const state = getState();
        state.deviceMode = 'desktop';
        renderCanvases();
        updateToolbarState();
    });
    document.getElementById('dev-tablet')?.addEventListener('click', () => {
        const state = getState();
        state.deviceMode = 'tablet';
        renderCanvases();
        updateToolbarState();
    });
    document.getElementById('dev-phone')?.addEventListener('click', () => {
        const state = getState();
        state.deviceMode = 'phone';
        renderCanvases();
        updateToolbarState();
    });
    
    // Add canvas/package
    document.getElementById('btn-add-canvas')?.addEventListener('click', () => {
        const state = getState();
        const name = prompt('Canvas name:', 'canvas-' + (state.canvases.length + 1));
        if (name) {
            const c = createCanvas(name, 1200, 800, 'page', false);
            state.canvases.push(c);
            state.selectedCanvasId = c.id;
            renderAll();
            pushHistory();
        }
    });
    
    document.getElementById('btn-add-package')?.addEventListener('click', () => {
        const state = getState();
        const name = prompt('Package name:', 'package-' + (state.packages.length + 1));
        if (name) {
            state.packages.push({ id: uid(), name: name, elements: [] });
            renderAll();
            pushHistory();
        }
    });
    
    // Style selector
    document.getElementById('btn-style-new')?.addEventListener('click', () => {
        const state = getState();
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
    
    document.getElementById('style-selector')?.addEventListener('change', function() {
        const name = this.value;
        if (name && getState().styles[name]) {
            alert('Style "' + name + '" selected. Apply it via element properties panel.');
        }
    });
    
    // Asset buttons
    document.getElementById('btn-asset-file')?.addEventListener('click', () => {
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
    
    document.getElementById('btn-asset-link')?.addEventListener('click', addAssetLink);
    
    // Asset panel drag-drop
    const assetsPanel = document.getElementById('panel-assets');
    const assetsBody = assetsPanel?.querySelector('.panel-body');
    if (assetsBody) {
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
                if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('font/')) {
                    addAssetFile(file);
                }
            }
        });
    }
    
    // Lightbox
    document.getElementById('lightbox')?.addEventListener('click', () => {
        document.getElementById('lightbox').classList.remove('active');
    });
    
    // Preview overlay
    document.getElementById('preview-close')?.addEventListener('click', () => {
        document.getElementById('preview-overlay').classList.remove('active');
    });
    document.getElementById('preview-overlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            document.getElementById('preview-overlay').classList.remove('active');
        }
    });
    
    // Palette items (drag to create)
    document.querySelectorAll('.palette-item').forEach(item => {
        item.addEventListener('click', () => {
            const type = item.dataset.type;
            const state = getState();
            const canvas = state.canvases.find(c => c.id === state.selectedCanvasId);
            if (!canvas) {
                alert('Please select or create a canvas first.');
                return;
            }
            const layer = canvas.layers.find(l => l.id === canvas.selectedLayerId);
            if (!layer || layer.locked) {
                alert('Please select an unlocked layer.');
                return;
            }
            
            const el = createElement(type);
            el.x = 100;
            el.y = 100;
            el.w = type === 'text' ? 200 : 100;
            el.h = type === 'text' ? 50 : 100;
            layer.elements.push(el);
            state.selectedElementId = el.id;
            renderAll();
            pushHistory();
        });
    });
    
    // Context menu
    document.getElementById('context-menu')?.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (!action) return;
        
        const state = getState();
        const elId = state.selectedElementId;
        const canvasId = state.selectedCanvasId;
        
        switch (action) {
            case 'delete':
                if (elId) {
                    removeElement(elId);
                    renderAll();
                    pushHistory();
                }
                break;
            case 'bring-forward':
                if (elId) {
                    bringForward(elId);
                    renderAll();
                    pushHistory();
                }
                break;
            case 'send-backward':
                if (elId) {
                    sendBackward(elId);
                    renderAll();
                    pushHistory();
                }
                break;
            case 'bring-to-front':
                if (elId) {
                    bringToFront(elId);
                    renderAll();
                    pushHistory();
                }
                break;
            case 'send-to-back':
                if (elId) {
                    sendToBack(elId);
                    renderAll();
                    pushHistory();
                }
                break;
            case 'mark-main':
                if (canvasId) {
                    state.canvases.forEach(c => c.isMain = false);
                    const canvas = findCanvas(canvasId);
                    if (canvas) canvas.isMain = true;
                    renderAll();
                    pushHistory();
                }
                break;
        }
        hideContextMenu();
    });
    
    // Hide context menu on click elsewhere
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#context-menu')) {
            hideContextMenu();
        }
    });
    
    // Undo/Redo keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                redo(renderAll, pushHistory);
            } else {
                undo(renderAll, pushHistory);
            }
        }
    });
}

export function undo(renderAll, pushHistory) {
    undoState(restoreSnapshot, dataURLToBlob, () => {
        renderAll();
    });
}

export function redo(renderAll, pushHistory) {
    redoState(restoreSnapshot, dataURLToBlob, () => {
        renderAll();
    });
}

function hideContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) menu.style.display = 'none';
}

export function selectElement(id) {
    const state = getState();
    state.selectedElementId = id;
    renderAll();
}

export function updateToolbarState() {
    const state = getState();
    ['dev-desktop', 'dev-tablet', 'dev-phone'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.toggle('active', state.deviceMode === id.replace('dev-', ''));
    });
}

export function applyZoomPan() {
    const state = getState();
    const scroll = document.getElementById('canvas-scroll');
    if (!scroll) return;
    scroll.style.transform = 'translate(' + state.panX + 'px,' + state.panY + 'px) scale(' + state.zoom + ')';
    scroll.style.transformOrigin = 'top left';
}

export function showPreview() {
    const state = getState();
    const canvas = state.canvases.find(c => c.isMain) || state.canvases[0];
    if (canvas) {
        showPreviewCanvas(canvas);
    }
}

export function showPreviewCanvas(canvas) {
    const overlay = document.getElementById('preview-overlay');
    const content = document.getElementById('preview-content');
    if (!overlay || !content) return;
    
    content.innerHTML = buildExportHTML(canvas);
    overlay.classList.add('active');
}

export function buildExportHTML(canvas, urlToPath = {}) {
    const state = getState();
    
    function replaceUrlsInData(obj) {
        if (typeof obj === 'string' && obj.startsWith('blob:')) {
            const asset = state.assets.find(a => a.url === obj);
            if (asset && urlToPath[asset.id]) {
                return urlToPath[asset.id];
            }
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(replaceUrlsInData);
        }
        if (obj && typeof obj === 'object') {
            const result = {};
            for (const key in obj) {
                result[key] = replaceUrlsInData(obj[key]);
            }
            return result;
        }
        return obj;
    }
    
    let html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>' + canvas.name + '</title>\n<style>\n* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { background: #0d0d0d; color: #e0e0e0; font-family: Inter, system-ui, sans-serif; }\n.canvas-container { width: ' + canvas.width + 'px; height: ' + canvas.height + 'px; background: ' + canvas.bgColor + '; position: relative; overflow: hidden; margin: 0 auto; }\n';
    
    // Add exported CSS styles
    for (const styleName in state.styles) {
        html += '/* Style: ' + styleName + ' */\n' + state.styles[styleName].css + '\n';
    }
    
    html += '</style>\n</head>\n<body>\n<div class="canvas-container">\n';
    
    for (const layer of canvas.layers) {
        if (layer.isBuffer) continue;
        html += '<div class="layer" data-layer="' + layer.name + '">\n';
        for (const el of layer.elements) {
            html += exportElementToHTML(el, urlToPath);
        }
        html += '</div>\n';
    }
    
    html += '</div>\n</body>\n</html>';
    return html;
}

export function exportElementToHTML(el, urlToPath = {}) {
    switch (el.type) {
        case 'box': {
            let html = '<div style="position:absolute;left:' + (el.x || 0) + 'px;top:' + (el.y || 0) + 'px;width:' + (el.w || 100) + 'px;height:' + (el.h || 50) + 'px;background:' + (el.bgColor || 'transparent') + ';border:' + el.borderSize + 'px ' + el.borderStyle + ' ' + (el.borderColor || 'transparent') + ';padding:' + el.padding + 'px;opacity:' + (el.opacity / 100) + ';">';
            
            html += '<div style="display:flex;flex-direction:column;gap:4px;width:100%;height:100%;">';
            for (let r = 0; r < el.gridRows; r++) {
                html += '<div style="display:flex;gap:4px;width:100%;flex:1 1 auto;">';
                for (let c = 0; c < el.gridCols; c++) {
                    const colIdx = r * el.gridCols + c;
                    const col = el.children[colIdx];
                    if (col) {
                        html += '<div style="background:rgba(255,255,255,0.05);border-radius:2px;padding:4px;flex:1 1 0;">';
                        for (const child of col.children) {
                            html += exportElementToHTML(child, urlToPath);
                        }
                        html += '</div>';
                    }
                }
                html += '</div>';
            }
            html += '</div></div>';
            return html;
        }
        
        case 'dynamic-box':
            return '<div style="position:absolute;left:' + (el.x || 0) + 'px;top:' + (el.y || 0) + 'px;width:' + (el.w || 100) + 'px;height:' + (el.h || 50) + 'px;background:#1a3a5a;display:flex;align-items:center;justify-content:center;opacity:' + (el.opacity / 100) + ';"><span style="color:#fff;font-size:12px;">Dynamic Box</span></div>';
        
        case 'text': {
            const highlightStyle = el.highlight ? 'background:' + el.highlight + ';' : '';
            return '<div style="position:absolute;left:' + (el.x || 0) + 'px;top:' + (el.y || 0) + 'px;width:' + (el.w || 200) + 'px;font-family:' + el.fontFamily + ';font-size:' + el.fontSize + 'px;color:' + el.color + ';font-weight:' + el.fontWeight + ';font-style:' + el.fontStyle + ';text-decoration:' + el.textDecoration + ';text-align:' + el.textAlign + ';letter-spacing:' + el.letterSpacing + 'px;line-height:' + el.lineHeight + ';padding:4px;opacity:' + (el.opacity / 100) + ';"><span style="' + highlightStyle + '">' + el.content + '</span></div>';
        }
        
        case 'media': {
            let src = el.src || '';
            if (src.startsWith('blob:') && el.assetId && urlToPath[el.assetId]) {
                src = urlToPath[el.assetId];
            }
            if (el.mediaType === 'video') {
                return '<video src="' + src + '" poster="' + el.poster + '" controls style="position:absolute;left:' + (el.x || 0) + 'px;top:' + (el.y || 0) + 'px;width:' + (el.w || 100) + 'px;height:' + (el.h || 100) + 'px;object-fit:' + (el.fit === 'crop' ? 'cover' : 'contain') + ';opacity:' + (el.opacity / 100) + ';"></video>';
            } else {
                return '<img src="' + src + '" alt="' + el.alt + '" style="position:absolute;left:' + (el.x || 0) + 'px;top:' + (el.y || 0) + 'px;width:' + (el.w || 100) + 'px;height:' + (el.h || 100) + 'px;object-fit:' + (el.fit === 'crop' ? 'cover' : 'contain') + ';opacity:' + (el.opacity / 100) + ';" />';
            }
        }
        
        case 'media-grid': {
            let html = '<div style="position:absolute;left:' + (el.x || 0) + 'px;top:' + (el.y || 0) + 'px;width:' + (el.w || 300) + 'px;height:' + (el.h || 200) + 'px;display:' + (el.layout === 'masonry' ? 'block' : 'grid') + ';grid-template-columns:repeat(' + (el.gridCols || 3) + ',1fr);gap:4px;opacity:' + (el.opacity / 100) + ';">';
            for (const item of (el.items || [])) {
                let src = item.src || '';
                if (src.startsWith('blob:') && item.assetId && urlToPath[item.assetId]) {
                    src = urlToPath[item.assetId];
                }
                html += '<div style="margin:' + (el.margin || 0) + 'px;border-radius:' + (el.cornerRadius || 0) + 'px;overflow:hidden;' + (el.layout === 'masonry' ? 'break-inside:avoid;margin-bottom:4px;' : '') + '">';
                if (item.mediaType === 'video') {
                    html += '<video src="' + src + '" poster="' + item.poster + '" controls style="width:100%;display:block;object-fit:' + (el.fit === 'crop' ? 'cover' : 'contain') + ';"></video>';
                } else {
                    html += '<img src="' + src + '" alt="' + item.alt + '" style="width:100%;display:block;object-fit:' + (el.fit === 'crop' ? 'cover' : 'contain') + ';" />';
                }
                html += '</div>';
            }
            html += '</div>';
            return html;
        }
        
        case 'button': {
            const anchor = el.anchor || 'tl';
            const styles = ANCHOR_STYLES[anchor] || ANCHOR_STYLES['tl'];
            const action = el.action || 'link';
            let style = 'border-radius:' + (el.cornerRadius || 4) + 'px;background:' + (el.bgColor || '#2a5a8a') + ';color:' + (el.color || '#ffffff') + ';border:' + (el.borderSize || 0) + 'px solid ' + (el.borderColor || 'transparent') + ';padding:4px 12px;cursor:pointer;font-size:' + (el.fontSize || 13) + 'px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-height:30px;min-width:30px;';
            if (el.autoWidth !== false) {
                style += 'width:auto;';
            } else if (el.width) {
                style += 'width:' + el.width + ';';
            }
            if (el.height) style += 'height:' + el.height + ';';
            const wrapStyle = 'display:flex;width:100%;height:100%;justify-content:' + styles.justifyContent + ';align-items:' + styles.alignItems + ';position:absolute;left:' + (el.x || 0) + 'px;top:' + (el.y || 0) + 'px;opacity:' + (el.opacity / 100) + ';';
            
            let contentHtml = '';
            if (el.children && el.children.length > 0) {
                for (const child of el.children) {
                    contentHtml += exportElementToHTML(child, urlToPath);
                }
            } else {
                contentHtml = '<span style="color:inherit;font-size:inherit;">' + (el.label || 'Button') + '</span>';
            }
            
            let actionAttrs = '';
            if (action === 'link') {
                actionAttrs = ' onclick="window.open(\'' + el.actionUrl + '\', \'' + (el.actionTarget || '_blank') + '\')"';
            }
            
            return '<div style="' + wrapStyle + '"><button' + actionAttrs + ' style="' + style + '"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;pointer-events:none;">' + contentHtml + '</div></button></div>';
        }
        
        default:
            return '<div>Unknown</div>';
    }
}

export function exportHTML() {
    const state = getState();
    const canvas = state.canvases.find(c => c.isMain) || state.canvases[0];
    if (!canvas) {
        alert('No canvas to export.');
        return;
    }
    
    const html = buildExportHTML(canvas);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = canvas.name + '.html';
    a.click();
    URL.revokeObjectURL(url);
}

export function exportZIP() {
    const state = getState();
    const canvas = state.canvases.find(c => c.isMain) || state.canvases[0];
    if (!canvas) {
        alert('No canvas to export.');
        return;
    }
    
    // For now, just export HTML - ZIP would require JSZip
    alert('ZIP export requires JSZip library. Using HTML export instead.');
    exportHTML();
}

export function saveProject() {
    const state = getState();
    const data = {
        canvases: state.canvases,
        packages: state.packages,
        styles: state.styles,
        assets: state.assets,
        nextId: state.nextId
    };
    const json = JSON.stringify(data);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project.json';
    a.click();
    URL.revokeObjectURL(url);
}

export function openProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                const snapshot = {
                    canvases: data.canvases,
                    packages: data.packages,
                    styles: data.styles,
                    assets: data.assets,
                    nextId: data.nextId,
                    selectedCanvasId: null,
                    selectedElementId: null
                };
                restoreSnapshot(snapshot, dataURLToBlob);
                renderAll();
                setHistory([], -1);
                pushHistory();
            } catch (e) {
                alert('Invalid project file.');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// Export all public functions
export {
    init, renderAll, renderAssets, renderCanvases, renderElement, renderLayersPanel,
    renderPackages, renderProperties, addAssetFile, addAssetLink, handleAssetDrop,
    showPreview, showPreviewCanvas, buildExportHTML, exportElementToHTML,
    exportHTML, exportZIP, saveProject, openProject, selectElement, updateToolbarState,
    applyZoomPan, undo, redo
};
