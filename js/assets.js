// ============================================================
// ASSET MANAGEMENT
// ============================================================

(function() {
    'use strict';

    const state = window.__PB_STATE;
    const { uid, dataURLToBlob } = window.__PB_UTILS;
    const { pushHistory } = window.__PB_HISTORY;

    const FONT_LIST = [
        'Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
        'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
        'Playfair Display', 'Merriweather', 'Oswald', 'Raleway',
        'Nunito', 'Quicksand', 'Work Sans', 'Source Sans Pro',
        'Titillium Web', 'Josefin Sans', 'Ubuntu', 'Dancing Script',
        'Pacifico', 'Shadows Into Light', 'Great Vibes'
    ];

    function renderAssets() {
        const assetsContainer = document.getElementById('asset-items-container');
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
            if (window.__PB_RENDER) window.__PB_RENDER.renderAll();
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
            if (window.__PB_RENDER) window.__PB_RENDER.renderAll();
            pushHistory();
        }
    }

    window.__PB_ASSETS = {
        FONT_LIST,
        renderAssets,
        addAssetFile,
        addAssetLink,
        handleAssetDrop,
    };

})();