// ============================================================
// UI - Context menu, preview, lightbox, event listeners, init
// ============================================================

(function() {
    'use strict';

    const core = window.PB.core;
    const actions = window.PB.actions;
    const renderers = window.PB.renderers;
    const state = core.state;
    const {
        uid, getDeviceScale, getAnchorStyles, dataURLToBlob,
        findCanvas, findElement, getParentCanvas,
        getElementContainer, getContainingLayer, FONT_LIST
    } = core;
    const {
        createElement, createCanvas, pushHistory, undo, redo,
        addAssetFile, addAssetLink, handleAssetDrop
    } = actions;
    const {
        renderAll, renderCanvases, renderLayersPanel, renderPackages,
        renderProperties, renderAssets, applyZoomPan, updateToolbarState
    } = renderers;

    let contextTargetCanvasId = null;
    let contextTargetElementId = null;

    // ---- CONTEXT MENU ----
    function showContextMenu(x, y, canvasId, elementId) {
        const contextMenu = document.getElementById('context-menu');
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
        const contextMenu = document.getElementById('context-menu');
        contextMenu.style.display = 'none';
    }

    // ---- PREVIEW ----
    function showPreviewCanvas(canvas) {
        const overlay = document.getElementById('preview-overlay');
        const content = document.getElementById('preview-content');
        content.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'preview-canvas';
        const scale = Math.min(1, (window.innerWidth - 120) / canvas.width, (window.innerHeight - 120) / canvas.height);
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
                const node = renderers.renderElement(el, 1);
                if (node) layerDiv.appendChild(node);
            }
            wrapper.appendChild(layerDiv);
        }
        content.appendChild(wrapper);
        overlay.classList.add('active');
    }

    // ---- LIGHTBOX ----
    function openLightbox(src) {
        const lb = document.getElementById('lightbox');
        const img = document.getElementById('lightbox-img');
        img.src = src;
        lb.classList.add('active');
    }

    // ---- SETUP EVENT LISTENERS ----
    function setupEventListeners() {
        // Palette items
        document.querySelectorAll('.palette-item').forEach(item => {
            item.draggable = true;
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', item.dataset.type);
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        // Panel minimize buttons
        document.querySelectorAll('.floating-panel .btn-minimize').forEach(btn => {
            btn.addEventListener('click', () => {
                const panel = btn.closest('.floating-panel');
                panel.classList.toggle('minimized');
                btn.textContent = panel.classList.contains('minimized') ? '+' : '_';
            });
        });

        // Panel drag
        document.querySelectorAll('.floating-panel .panel-header').forEach(header => {
            const panel = header.closest('.floating-panel');
            let dragging = false, startX, startY, origX, origY;
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

        // Container zoom/pan with middle mouse
        const containerEl = document.getElementById('canvas-container');
        const scrollEl = document.getElementById('canvas-scroll');
        containerEl.addEventListener('mousedown', (e) => {
            if (e.button === 1) {
                e.preventDefault();
                const startX = e.clientX, startY = e.clientY;
                const startPanX = state.panX, startPanY = state.panY;
                const onMove = (ev) => {
                    state.panX = startPanX + (ev.clientX - startX) / state.zoom;
                    state.panY = startPanY + (ev.clientY - startY) / state.zoom;
                    applyZoomPan();
                };
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            }
        });

        // Mouse wheel zoom
        containerEl.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            state.zoom = Math.max(0.1, Math.min(3, state.zoom + delta));
            applyZoomPan();
        }, { passive: false });

        // Context menu click outside
        document.addEventListener('click', (e) => {
            const contextMenu = document.getElementById('context-menu');
            if (!contextMenu.contains(e.target)) {
                hideContextMenu();
            }
        });

        // Context menu item clicks
        document.getElementById('context-menu').addEventListener('click', (e) => {
            const item = e.target.closest('.menu-item');
            if (!item || item.classList.contains('disabled')) return;
            const action = item.dataset.action;
            if (action === 'delete' && contextTargetElementId) {
                actions.removeElement(contextTargetElementId);
                renderAll();
                pushHistory();
            } else if (action === 'bring-forward' && contextTargetElementId) {
                actions.bringForward(contextTargetElementId);
                renderAll();
                pushHistory();
            } else if (action === 'send-backward' && contextTargetElementId) {
                actions.sendBackward(contextTargetElementId);
                renderAll();
                pushHistory();
            } else if (action === 'bring-to-front' && contextTargetElementId) {
                actions.bringToFront(contextTargetElementId);
                renderAll();
                pushHistory();
            } else if (action === 'send-to-back' && contextTargetElementId) {
                actions.sendToBack(contextTargetElementId);
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

        // Keyboard shortcuts (undo/redo)
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
                e.preventDefault();
                redo();
            }
        });

        // ---- TOOLBAR BUTTONS ----
        document.getElementById('dev-desktop').addEventListener('click', () => {
            state.deviceMode = 'desktop';
            renderCanvases();
            updateToolbarState();
        });
        document.getElementById('dev-tablet').addEventListener('click', () => {
            state.deviceMode = 'tablet';
            renderCanvases();
            updateToolbarState();
        });
        document.getElementById('dev-phone').addEventListener('click', () => {
            state.deviceMode = 'phone';
            renderCanvases();
            updateToolbarState();
        });

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
                if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('font/')) {
                    addAssetFile(file);
                }
            }
        });

        document.getElementById('lightbox').addEventListener('click', () => {
            document.getElementById('lightbox').classList.remove('active');
        });

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

        // ---- SAVE / OPEN ----
        document.getElementById('btn-save').addEventListener('click', () => {
            const data = JSON.stringify({
                canvases: state.canvases,
                packages: state.packages,
                styles: state.styles,
                assets: state.assets.map(a => ({
                    id: a.id,
                    type: a.type,
                    name: a.name,
                    url: a.url,
                    data: a.data,
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

                        for (const asset of state.assets) {
                            if (asset.data && asset.data.startsWith('data:')) {
                                const blob = dataURLToBlob(asset.data);
                                const url = URL.createObjectURL(blob);
                                state.assetBlobMap[asset.id] = url;
                                asset.url = url;
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

        // ---- EXPORT buttons call export module ----
        document.getElementById('btn-export').addEventListener('click', () => {
            if (window.PB.export && window.PB.export.exportHTML) {
                window.PB.export.exportHTML();
            } else {
                alert('Export module not loaded');
            }
        });

        document.getElementById('btn-export-zip').addEventListener('click', async function() {
            if (window.PB.export && window.PB.export.exportZIP) {
                await window.PB.export.exportZIP();
            } else {
                alert('Export module not loaded');
            }
        });
    }

    // ---- INIT ----
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

    // ---- EXPOSE UI ----
    window.PB = window.PB || {};
    window.PB.ui = {
        showContextMenu,
        hideContextMenu,
        showPreviewCanvas,
        openLightbox,
        setupEventListeners,
        init,
    };
})();