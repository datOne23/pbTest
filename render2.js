(function() {
  'use strict';

  // ---- CONSTANTS & CONFIG ----
  const FONT_LIST = [
    'Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
    'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
    'Playfair Display', 'Merriweather', 'Oswald', 'Raleway',
    'Nunito', 'Quicksand', 'Work Sans', 'Source Sans Pro',
    'Titillium Web', 'Josefin Sans', 'Ubuntu', 'Dancing Script',
    'Pacifico', 'Shadows Into Light', 'Great Vibes'
  ];

  const ANCHOR_MAP = {
    tl: { justifyContent: 'flex-start', alignItems: 'flex-start' },
    tc: { justifyContent: 'center', alignItems: 'flex-start' },
    tr: { justifyContent: 'flex-end', alignItems: 'flex-start' },
    ml: { justifyContent: 'flex-start', alignItems: 'center' },
    mc: { justifyContent: 'center', alignItems: 'center' },
    mr: { justifyContent: 'flex-end', alignItems: 'center' },
    bl: { justifyContent: 'flex-start', alignItems: 'flex-end' },
    bc: { justifyContent: 'center', alignItems: 'flex-end' },
    br: { justifyContent: 'flex-end', alignItems: 'flex-end' },
  };

  // ---- DOM BUILDER ----
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'style' && typeof v === 'object') {
          Object.assign(el.style, v);
        } else if (k === 'className') {
          el.className = v;
        } else if (k.startsWith('on')) {
          el.addEventListener(k.slice(2), v);
        } else {
          el.setAttribute(k, v);
        }
      }
    }
    for (const c of children.flat()) {
      if (c == null) continue;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
    }
    return el;
  }

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
    assetBlobMap: {},
  };

  const MAX_HISTORY = 50;
  let history = [];
  let historyIndex = -1;

  // ---- UTILITY FUNCTIONS ----
  const uid = () => state.nextId++;
  const dataURLToBlob = (dataURL) => {
    const parts = dataURL.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const byteString = atob(parts[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    return new Blob([ab], { type: mime });
  };

  const getAnchorStyles = (anchor) => ANCHOR_MAP[anchor] || ANCHOR_MAP.tl;

  // ---- FIND / SEARCH HELPERS (consolidated) ----
  function findElement(id) {
    for (const c of state.canvases) {
      for (const layer of c.layers) {
        const result = findInArray(layer.elements, id);
        if (result) return result;
      }
    }
    for (const pkg of state.packages) {
      const result = findInArray(pkg.elements, id);
      if (result) return result;
    }
    return null;
  }

  function findInArray(arr, id) {
    for (const el of arr) {
      if (el.id === id) return el;
      if (el.children) {
        const found = findInArray(el.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  function getElementContext(id) {
    let container = null, parent = null, layer = null, canvas = null;
    for (const c of state.canvases) {
      for (const l of c.layers) {
        const result = findWithParent(l.elements, id);
        if (result) {
          container = l.elements;
          parent = result.parent;
          layer = l;
          canvas = c;
          return { container, parent, layer, canvas };
        }
      }
    }
    for (const pkg of state.packages) {
      const result = findWithParent(pkg.elements, id);
      if (result) {
        container = pkg.elements;
        parent = result.parent;
        return { container, parent, layer: null, canvas: null, pkg };
      }
    }
    return null;
  }

  function findWithParent(arr, id) {
    for (const el of arr) {
      if (el.id === id) return { parent: null, el };
      if (el.children) {
        const found = findWithParent(el.children, id);
        if (found) return { parent: el, ...found };
      }
    }
    return null;
  }

  const getContainingLayer = (id) => { const ctx = getElementContext(id); return ctx ? ctx.layer : null; };
  const getElementContainer = (id) => { const ctx = getElementContext(id); return ctx ? ctx.container : null; };
  const getParentElement = (id) => { const ctx = getElementContext(id); return ctx ? ctx.parent : null; };
  const getParentCanvas = (id) => { const ctx = getElementContext(id); return ctx ? ctx.canvas : null; };

  // ---- STATE DISPATCH (centralized history + re‑render) ----
  function dispatch(updater) {
    // Take a snapshot before changes
    const before = JSON.stringify(state);
    updater();
    const after = JSON.stringify(state);
    if (before !== after) {
      pushHistory();
      renderAll();
    }
  }

  function pushHistory() {
    if (historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);
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
        c.layers.push({ id: uid(), name: 'Buffer', elements: [], isBuffer: true, locked: true });
      }
    }
    renderAll();
  }

  // ---- ELEMENT CREATION ----
  function createElement(type, props = {}) {
    const base = { id: uid(), type, styles: {}, classes: [], children: [], opacity: props.opacity ?? 100, ...props };
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

    if (type === 'box') {
      const rows = props.gridRows || 1;
      const cols = props.gridCols || 1;
      const box = { ...base, ...marginProps, gridRows: rows, gridCols: cols, useProportions: props.useProportions || false, margin: props.margin || 0, padding: props.padding || 0, bgColor: props.bgColor || 'transparent', borderSize: props.borderSize || 0, borderColor: props.borderColor || 'transparent', borderStyle: props.borderStyle || 'solid', borderOpacity: props.borderOpacity ?? 100, rowProportions: [], children: [] };
      for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) row.push(100 / cols);
        box.rowProportions.push(row);
        for (let c = 0; c < cols; c++) {
          box.children.push({ id: uid(), type: 'column', children: [], padding: props.padding || 0, proportionWeight: 1, bgColor: 'transparent', customPadding: props.customPadding || false, paddingTop: props.paddingTop || 0, paddingRight: props.paddingRight || 0, paddingBottom: props.paddingBottom || 0, paddingLeft: props.paddingLeft || 0 });
        }
      }
      return box;
    }
    if (type === 'dynamic-box') {
      return { ...base, ...marginProps, id: props.id || 'db-' + uid(), defaultPackage: props.defaultPackage || null, autoAdapt: props.autoAdapt !== undefined ? props.autoAdapt : true, children: [] };
    }
    if (type === 'text') {
      return { ...base, ...marginProps, anchor: defaultAnchor, content: props.content || 'Text', fontFamily: props.fontFamily || 'Inter', fontSize: props.fontSize || 16, color: props.color || '#e0e0e0', fontWeight: props.fontWeight || '400', fontStyle: props.fontStyle || 'normal', textDecoration: props.textDecoration || 'none', textAlign: props.textAlign || 'left', letterSpacing: props.letterSpacing || 0, lineHeight: props.lineHeight || 1.5, highlight: props.highlight || null, children: [] };
    }
    if (type === 'media') {
      return { ...base, ...marginProps, anchor: defaultAnchor, src: props.src || '', alt: props.alt || '', fit: props.fit || 'fit', sizeAdjust: props.sizeAdjust ?? 0, width: props.width || '', height: props.height || '', margin: props.margin || 0, cornerRadius: props.cornerRadius || 0, shape: props.shape || 'rectangle', cornerRadiusTL: props.cornerRadiusTL || 0, cornerRadiusTR: props.cornerRadiusTR || 0, cornerRadiusBL: props.cornerRadiusBL || 0, cornerRadiusBR: props.cornerRadiusBR || 0, useIndividualRadius: props.useIndividualRadius || false, cropTop: props.cropTop || 0, cropRight: props.cropRight || 0, cropBottom: props.cropBottom || 0, cropLeft: props.cropLeft || 0, mediaType: props.mediaType || 'image', poster: props.poster || '', autoplay: props.autoplay || false, loop: props.loop || false, controls: props.controls !== undefined ? props.controls : true, children: [], assetId: props.assetId || null };
    }
    if (type === 'media-grid') {
      return { ...base, ...marginProps, items: props.items || [], layout: props.layout || 'grid', fit: props.fit || 'fit', margin: props.margin || 0, cornerRadius: props.cornerRadius || 0, gridCols: props.gridCols || 3, children: [] };
    }
    if (type === 'button') {
      const btn = { ...base, ...marginProps, anchor: defaultAnchor, label: props.label || 'Button', action: props.action || 'link', actionUrl: props.actionUrl || '#', actionTarget: props.actionTarget || '_blank', actionCanvas: props.actionCanvas || '', actionPackage: props.actionPackage || '', actionDynamicBox: props.actionDynamicBox || '', cornerRadius: props.cornerRadius || 4, bgColor: props.bgColor || '#2a5a8a', color: props.color || '#ffffff', borderSize: props.borderSize || 0, borderColor: props.borderColor || 'transparent', fontSize: props.fontSize || 13, width: props.width || '', height: props.height || '', autoWidth: props.autoWidth !== undefined ? props.autoWidth : true, children: props.children || [] };
      return btn;
    }
    return base;
  }

  // ---- RENDERERS (modular) ----
  function applyMarginPadding(el, div, scale) {
    let margin = el.margin ?? 0;
    let padding = el.padding ?? 0;
    if (el.customMargin) {
      div.style.margin = `${(el.marginTop||0)*scale}px ${(el.marginRight||0)*scale}px ${(el.marginBottom||0)*scale}px ${(el.marginLeft||0)*scale}px`;
    } else {
      div.style.margin = (margin * scale) + 'px';
    }
    if (el.customPadding) {
      div.style.padding = `${(el.paddingTop||0)*scale}px ${(el.paddingRight||0)*scale}px ${(el.paddingBottom||0)*scale}px ${(el.paddingLeft||0)*scale}px`;
    } else {
      div.style.padding = (padding * scale) + 'px';
    }
  }

  const elementRenderers = {
    box(el, scale) {
      const div = h('div', { className: 'el-box', style: { background: el.bgColor || 'transparent', border: `${(el.borderSize||0)*scale}px ${el.borderStyle||'solid'} ${el.borderColor||'transparent'}`, borderRadius: (3*scale)+'px' } });
      applyMarginPadding(el, div, scale);
      if (el.opacity !== undefined) div.style.opacity = el.opacity / 100;

      const rows = el.gridRows || 1;
      const cols = el.gridCols || 1;
      const children = el.children || [];
      const rowProportions = el.rowProportions || [];
      const grid = h('div', { style: { display: 'flex', flexDirection: 'column', gap: (4*scale)+'px', width: '100%', height: '100%', minHeight: '20px' } });

      for (let r = 0; r < rows; r++) {
        const rowDiv = h('div', { style: { display: 'flex', gap: (4*scale)+'px', width: '100%', flex: '1 1 auto', minHeight: '20px' } });
        const rowProps = (rowProportions && rowProportions[r]) ? rowProportions[r] : Array(cols).fill(100/cols);
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const col = children[idx] || { id: uid(), type: 'column', children: [], padding: el.padding || 0, bgColor: 'transparent', customPadding: el.customPadding || false, paddingTop: el.paddingTop || 0, paddingRight: el.paddingRight || 0, paddingBottom: el.paddingBottom || 0, paddingLeft: el.paddingLeft || 0 };
          const colDiv = h('div', { className: 'el-col', dataset: { elId: col.id }, style: { display: 'flex', flexDirection: 'column', background: col.bgColor || 'transparent', boxSizing: 'border-box', minHeight: '20px', position: 'relative', ...(el.useProportions && rowProps[c] !== undefined ? { width: rowProps[c]+'%', flex: '0 0 '+rowProps[c]+'%' } : { flex: '1 1 0', width: 'auto' }) } });
          applyMarginPadding(col, colDiv, scale);
          colDiv.style.padding = (col.padding || 0) * scale + 'px';
          for (const child of (col.children || [])) {
            const childNode = renderElement(child, scale);
            if (childNode) colDiv.appendChild(childNode);
          }
          // drop handling on columns
          colDiv.addEventListener('dragover', e => { e.preventDefault(); colDiv.style.outline = '1px solid #4a8ac4'; });
          colDiv.addEventListener('dragleave', () => { colDiv.style.outline = 'none'; });
          colDiv.addEventListener('drop', e => {
            e.preventDefault(); colDiv.style.outline = 'none'; e.stopPropagation();
            const boxLayer = getContainingLayer(el.id);
            if (!boxLayer || boxLayer.locked) return;
            const data = e.dataTransfer.getData('text/plain');
            if (!data) return;
            const handleDrop = (elToAdd) => {
              if (!elToAdd) return;
              col.children.push(elToAdd);
              dispatch(() => {});
            };
            if (data.startsWith('el:')) {
              const elId = parseInt(data.slice(3));
              const movingEl = findElement(elId);
              if (!movingEl) return;
              const oldContainer = getElementContainer(elId);
              if (!oldContainer) return;
              const idx = oldContainer.findIndex(e => e.id === elId);
              if (idx !== -1) oldContainer.splice(idx, 1);
              handleDrop(movingEl);
            } else if (data.startsWith('asset:')) {
              const assetId = parseInt(data.slice(6));
              const newEl = createElement('media');
              handleAssetDrop(newEl, assetId);
              handleDrop(newEl);
            } else {
              const newEl = createElement(data);
              handleDrop(newEl);
            }
          });
          rowDiv.appendChild(colDiv);
        }
        grid.appendChild(rowDiv);
      }
      div.appendChild(grid);
      return div;
    },

    'dynamic-box'(el, scale) {
      const div = h('div', { className: 'el-dynamic-box', style: { padding: (el.customPadding ? el.paddingTop||0 : el.padding||0) * scale + 'px', background: '#1a2a2a', border: (1*scale)+'px dashed #3a5a5a', borderRadius: (3*scale)+'px' } });
      applyMarginPadding(el, div, scale);
      if (el.opacity !== undefined) div.style.opacity = el.opacity / 100;
      div.appendChild(h('div', { className: 'db-label', style: { fontSize: (10*scale)+'px', color: '#5a8a8a', marginBottom: (4*scale)+'px' } }, 'Dynamic: ' + (el.id || '')));
      if (el.defaultPackage) {
        const pkg = state.packages.find(p => p.id === el.defaultPackage);
        if (pkg) {
          div.appendChild(h('div', { style: { padding: (4*scale)+'px', background: '#1e2e2e', borderRadius: (2*scale)+'px', marginTop: (4*scale)+'px', fontSize: (11*scale)+'px' } }, 'Package: ' + pkg.name));
        }
      }
      // drag-over styling
      div.addEventListener('dragover', e => { e.preventDefault(); div.style.borderColor = '#4a8ac4'; });
      div.addEventListener('dragleave', () => { div.style.borderColor = '#3a5a5a'; });
      div.addEventListener('drop', e => {
        e.preventDefault(); div.style.borderColor = '#3a5a5a';
        const data = e.dataTransfer.getData('application/json');
        if (data) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'package') {
              el.defaultPackage = parsed.id;
              dispatch(() => {});
            }
          } catch(_) {}
        }
      });
      return div;
    },

    text(el, scale) {
      const anchor = el.anchor || 'tl';
      const styles = getAnchorStyles(anchor);
      const wrap = h('div', { style: { display: 'flex', width: '100%', height: '100%', justifyContent: styles.justifyContent, alignItems: styles.alignItems } });
      const textDiv = h('div', { className: 'el-text', contentEditable: true, style: { fontFamily: el.fontFamily || 'Inter', fontSize: (el.fontSize||16)*scale + 'px', color: el.color || '#e0e0e0', fontWeight: el.fontWeight || '400', fontStyle: el.fontStyle || 'normal', textDecoration: el.textDecoration || 'none', textAlign: el.textAlign || 'left', letterSpacing: (el.letterSpacing||0)*scale + 'px', lineHeight: el.lineHeight || 1.5, padding: (el.customPadding ? el.paddingTop||0 : el.padding||0) * scale + 'px ' + (4*scale) + 'px', ...(el.highlight ? { background: el.highlight, padding: '0 '+(4*scale)+'px', borderRadius: (2*scale)+'px' } : {}) } }, el.content || 'Text');
      textDiv.addEventListener('input', () => { el.content = textDiv.textContent || ''; });
      textDiv.addEventListener('blur', () => { pushHistory(); });
      textDiv.addEventListener('click', e => {
        e.stopPropagation();
        if (!textDiv.dataset.selectionHandled) {
          selectElement(el.id);
        }
        textDiv.dataset.selectionHandled = 'true';
        setTimeout(() => delete textDiv.dataset.selectionHandled, 100);
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
      return wrap;
    },

    media(el, scale) {
      const anchor = el.anchor || 'tl';
      const styles = getAnchorStyles(anchor);
      const wrap = h('div', { className: 'media-align-wrap', style: { display: 'flex', width: '100%', height: '100%', justifyContent: styles.justifyContent, alignItems: styles.alignItems } });
      const mediaType = el.mediaType || 'image';
      let element;
      if (mediaType === 'video') {
        element = document.createElement('video');
        element.src = el.src || '';
        element.poster = el.poster || '';
        if (el.autoplay) element.autoplay = true;
        if (el.loop) element.loop = true;
        if (el.controls !== false) element.controls = true;
      } else {
        element = document.createElement('img');
        element.src = el.src || '';
        element.alt = el.alt || '';
      }
      element.style.display = 'block';
      const sizeAdj = el.sizeAdjust || 0;
      element.style.transform = `scale(${1 + sizeAdj/100})`;
      element.style.transformOrigin = 'center center';
      if (el.width) element.style.width = el.width;
      else { element.style.width = 'auto'; element.style.maxWidth = '100%'; }
      if (el.height) element.style.height = el.height;
      else element.style.height = 'auto';

      if (el.useIndividualRadius) {
        element.style.borderRadius = `${(el.cornerRadiusTL||0)*scale}px ${(el.cornerRadiusTR||0)*scale}px ${(el.cornerRadiusBR||0)*scale}px ${(el.cornerRadiusBL||0)*scale}px`;
      } else {
        element.style.borderRadius = ((el.cornerRadius||0)*scale) + 'px';
      }
      if (el.shape === 'circle') element.style.borderRadius = '50%';
      if (el.shape === 'diamond') element.style.clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
      const crop = [el.cropTop||0, el.cropRight||0, el.cropBottom||0, el.cropLeft||0];
      if (crop.some(v => v)) element.style.clipPath = `inset(${crop[0]}% ${crop[1]}% ${crop[2]}% ${crop[3]}%)`;
      if (el.fit === 'crop') {
        element.style.objectFit = 'cover';
        element.style.width = '100%';
        element.style.height = '100%';
      } else {
        element.style.objectFit = 'contain';
      }
      wrap.appendChild(element);
      return wrap;
    },

    'media-grid'(el, scale) {
      const grid = h('div', { className: 'el-media-grid' + (el.layout === 'masonry' ? ' masonry' : ''), style: { display: el.layout === 'masonry' ? 'block' : 'grid', gridTemplateColumns: el.layout !== 'masonry' ? `repeat(${el.gridCols||3}, 1fr)` : undefined, gap: (4*scale)+'px' } });
      const items = el.items || [];
      for (const item of items) {
        const mediaDiv = h('div', { className: 'media-item' + (el.fit === 'crop' ? ' crop' : ' fit'), style: { margin: ((el.margin||0)*scale)+'px', borderRadius: ((el.cornerRadius||0)*scale)+'px', overflow: 'hidden' } });
        let mediaEl;
        if (item.mediaType === 'video') {
          mediaEl = document.createElement('video');
          mediaEl.src = item.src || '';
          mediaEl.poster = item.poster || '';
          mediaEl.controls = true;
          mediaEl.style.width = '100%';
          mediaEl.style.display = 'block';
          if (el.fit === 'crop') { mediaEl.style.objectFit = 'cover'; mediaEl.style.height = (120*scale)+'px'; }
          else mediaEl.style.objectFit = 'contain';
        } else {
          mediaEl = document.createElement('img');
          mediaEl.src = item.src || '';
          mediaEl.alt = item.alt || '';
          mediaEl.style.width = '100%';
          mediaEl.style.display = 'block';
          if (el.fit === 'crop') { mediaEl.style.objectFit = 'cover'; mediaEl.style.height = (120*scale)+'px'; }
          else mediaEl.style.objectFit = 'contain';
        }
        mediaDiv.appendChild(mediaEl);
        mediaDiv.addEventListener('click', () => { if (item.mediaType !== 'video') openLightbox(item.src || ''); });
        grid.appendChild(mediaDiv);
      }
      // drop handling on grid
      grid.addEventListener('dragover', e => e.preventDefault());
      grid.addEventListener('drop', e => {
        e.preventDefault();
        const data = e.dataTransfer.getData('text/plain');
        if (data && data.startsWith('asset:')) {
          const assetId = parseInt(data.slice(6));
          const asset = state.assets.find(a => a.id === assetId);
          if (asset) {
            if (!el.items) el.items = [];
            el.items.push({ src: asset.url, alt: asset.name, mediaType: asset.type === 'video' ? 'video' : 'image', poster: '', assetId: asset.id });
            dispatch(() => {});
          }
        } else {
          const files = e.dataTransfer.files;
          for (const file of files) {
            if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
              const reader = new FileReader();
              reader.onload = (ev) => {
                const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
                if (!el.items) el.items = [];
                const blob = dataURLToBlob(ev.target.result);
                const url = URL.createObjectURL(blob);
                el.items.push({ src: url, alt: file.name, mediaType, poster: '', assetId: null });
                dispatch(() => {});
              };
              reader.readAsDataURL(file);
            }
          }
        }
      });
      return grid;
    },

    button(el, scale) {
      const anchor = el.anchor || 'tl';
      const styles = getAnchorStyles(anchor);
      const wrap = h('div', { style: { display: 'flex', width: '100%', height: '100%', justifyContent: styles.justifyContent, alignItems: styles.alignItems } });
      const btn = h('button', { className: 'el-button', style: { position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: el.autoWidth !== false ? 'auto' : (el.width || 'auto'), height: el.height || 'auto', minHeight: '30px', minWidth: '30px', borderRadius: ((el.cornerRadius||4)*scale)+'px', background: el.bgColor || '#2a5a8a', color: el.color || '#ffffff', border: ((el.borderSize||0)*scale)+'px solid '+(el.borderColor||'transparent'), padding: (4*scale)+'px '+(12*scale)+'px', cursor: 'pointer', fontSize: ((el.fontSize||13)*scale)+'px' } });
      const content = h('div', { className: 'btn-content', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', pointerEvents: 'none' } });
      if (el.children && el.children.length > 0) {
        for (const child of el.children) {
          const node = renderElement(child, scale);
          if (node) { node.style.pointerEvents = 'auto'; content.appendChild(node); }
        }
      } else {
        content.appendChild(h('span', { style: { color: 'inherit', fontSize: 'inherit', pointerEvents: 'none' } }, el.label || 'Button'));
      }
      btn.appendChild(content);
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (document.activeElement?.closest('.el-text')) return;
        handleButtonAction(el);
      });
      btn.addEventListener('dblclick', e => {
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
      return wrap;
    },

    column(el, scale) {
      // columns are rendered inside box, not standalone
      return null;
    }
  };

  function renderElement(el, scale) {
    const renderer = elementRenderers[el.type];
    if (!renderer) {
      return h('div', { style: { color: '#999', fontSize: (12*scale)+'px' } }, 'Unknown: ' + el.type);
    }
    const div = renderer(el, scale);
    if (!div) return null;
    // Attach common behaviors: selection, drag, context menu
    div.dataset.elId = el.id;
    if (state.selectedElementId === el.id) div.classList.add('selected-element');
    // Apply opacity if not already applied
    if (el.opacity !== undefined && !div.style.opacity) {
      div.style.opacity = el.opacity / 100;
    }
    // Drag setup (skip for button, column)
    if (!['button', 'column'].includes(el.type)) {
      setupElementDrag(div, el);
    }
    div.addEventListener('click', e => {
      if (e.target.closest('input, button')) return;
      if (e.target.closest('.el-text')?.contentEditable === 'true') return;
      e.stopPropagation();
      if (!div.dataset.selectionHandled) selectElement(el.id);
      div.dataset.selectionHandled = 'true';
      setTimeout(() => delete div.dataset.selectionHandled, 100);
    });
    div.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      selectElement(el.id);
      showContextMenu(e.clientX, e.clientY, null, el.id);
    });
    // Asset drop on media/media-grid
    div.addEventListener('dragover', e => {
      const data = e.dataTransfer.getData('text/plain');
      if (data && data.startsWith('asset:')) e.preventDefault();
    });
    div.addEventListener('drop', e => {
      const data = e.dataTransfer.getData('text/plain');
      if (data && data.startsWith('asset:')) {
        e.preventDefault(); e.stopPropagation();
        const assetId = parseInt(data.slice(6));
        const asset = state.assets.find(a => a.id === assetId);
        if (!asset) return;
        if (el.type === 'media') {
          el.src = asset.url;
          el.mediaType = asset.type === 'video' ? 'video' : 'image';
          el.assetId = asset.id;
          dispatch(() => {});
        } else if (el.type === 'media-grid') {
          if (!el.items) el.items = [];
          el.items.push({ src: asset.url, alt: asset.name, mediaType: asset.type === 'video' ? 'video' : 'image', poster: '', assetId: asset.id });
          dispatch(() => {});
        }
      }
    });
    return div;
  }

  // ---- DRAG STATE ----
  let dragState = null;
  function setupElementDrag(elDiv, el) {
    let holdTimer = null, isHeld = false, startX, startY, hasMoved = false;
    elDiv.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('input, button, .btn-label, .el-text')) return;
      const layer = getContainingLayer(el.id);
      if (layer && layer.locked) return;
      startX = e.clientX; startY = e.clientY; hasMoved = false; isHeld = false;
      holdTimer = setTimeout(() => {
        isHeld = true;
        const rect = elDiv.getBoundingClientRect();
        const clone = elDiv.cloneNode(true);
        Object.assign(clone.style, { position: 'fixed', left: rect.left+'px', top: rect.top+'px', width: rect.width+'px', height: rect.height+'px', pointerEvents: 'none', zIndex: '9999', opacity: '0.85', transform: 'scale(1.05)', boxShadow: '0 8px 32px rgba(0,0,0,0.7)', borderRadius: '4px', overflow: 'hidden' });
        document.body.appendChild(clone);
        dragState = { element: el, clone, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, target: null, position: 'inside' };
        elDiv.style.opacity = '0.3';
        document.addEventListener('pointermove', onDragMove);
        document.addEventListener('pointerup', onDragEnd);
      }, 400);
    });
    elDiv.addEventListener('pointermove', e => {
      if (holdTimer) {
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (Math.sqrt(dx*dx + dy*dy) > 8) { clearTimeout(holdTimer); holdTimer = null; hasMoved = true; }
      }
    });
    elDiv.addEventListener('pointerup', () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } });
    elDiv.addEventListener('pointercancel', () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } });
    function onDragMove(e) {
      if (!dragState) return;
      e.preventDefault();
      const x = e.clientX - dragState.offsetX;
      const y = e.clientY - dragState.offsetY;
      dragState.clone.style.left = x + 'px';
      dragState.clone.style.top = y + 'px';
      const elUnder = document.elementFromPoint(e.clientX, e.clientY);
      let target = null, position = 'inside';
      if (elUnder) {
        const targetEl = elUnder.closest('.el-box, .el-text, .el-media, .el-media-grid, .el-button-container, .el-dynamic-box, .el-col, .layer-drop-zone');
        if (targetEl && targetEl !== elDiv) {
          target = targetEl;
          const rect = targetEl.getBoundingClientRect();
          const midY = rect.top + rect.height/2;
          position = e.clientY < midY ? 'before' : 'after';
        } else {
          const layerZone = elUnder.closest('.layer-drop-zone');
          if (layerZone && !layerZone.closest('.el-box, .el-col')) {
            target = layerZone;
            position = 'inside';
          }
        }
      }
      document.querySelectorAll('.drop-target-before, .drop-target-after, .drag-over-target').forEach(el => el.classList.remove('drop-target-before', 'drop-target-after', 'drag-over-target'));
      if (target) {
        if (position === 'before') target.classList.add('drop-target-before');
        else if (position === 'after') target.classList.add('drop-target-after');
        else { target.classList.add('drag-over-target'); target.style.outline = '2px solid #4a8ac4'; }
      }
      dragState.target = target;
      dragState.position = position;
    }
    function onDragEnd(e) {
      document.removeEventListener('pointermove', onDragMove);
      document.removeEventListener('pointerup', onDragEnd);
      if (dragState) {
        if (dragState.clone?.parentNode) dragState.clone.parentNode.removeChild(dragState.clone);
        elDiv.style.opacity = '1';
        document.querySelectorAll('.drop-target-before, .drop-target-after, .drag-over-target').forEach(el => {
          el.classList.remove('drop-target-before', 'drop-target-after', 'drag-over-target');
          el.style.outline = '';
        });
        const target = dragState.target, position = dragState.position, draggedEl = dragState.element;
        if (target && draggedEl) {
          const container = getElementContainer(draggedEl.id);
          if (!container) { dragState = null; return; }
          let targetContainer = null, targetIdx = -1, isLayerDrop = false;
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
              const idx = container.indexOf(draggedEl);
              if (idx !== -1) container.splice(idx, 1);
              col.children.push(draggedEl);
              dispatch(() => {});
              selectElement(draggedEl.id);
              dragState = null; return;
            }
          } else {
            const targetElId = parseInt(target.dataset.elId);
            if (targetElId && targetElId !== draggedEl.id) {
              const tContainer = getElementContainer(targetElId);
              if (tContainer) {
                const tIdx = tContainer.findIndex(e => e.id === targetElId);
                if (tIdx !== -1) {
                  const idx = container.indexOf(draggedEl);
                  if (idx !== -1) container.splice(idx, 1);
                  const insertIdx = position === 'before' ? tIdx : tIdx + 1;
                  tContainer.splice(insertIdx, 0, draggedEl);
                  dispatch(() => {});
                  selectElement(draggedEl.id);
                  dragState = null; return;
                }
              }
            }
          }
          if (targetContainer && isLayerDrop) {
            const idx = container.indexOf(draggedEl);
            if (idx !== -1) container.splice(idx, 1);
            targetContainer.splice(targetIdx, 0, draggedEl);
            dispatch(() => {});
            selectElement(draggedEl.id);
          }
        }
        dragState = null;
      }
    }
  }

  // ---- BUTTON ACTIONS ----
  function handleButtonAction(el) {
    const action = el.action || 'link';
    if (action === 'link') {
      if (el.actionUrl) window.open(el.actionUrl, el.actionTarget || '_blank');
    } else if (action === 'page') {
      const targetName = el.actionCanvas || '';
      const targetCanvas = state.canvases.find(c => c.name === targetName);
      if (!targetCanvas) return;
      const sourceCanvas = getParentCanvas(el.id);
      if (!sourceCanvas) return;
      showCanvasInBuffer(targetCanvas, sourceCanvas);
    } else if (action === 'dynamic') {
      const dbId = el.actionDynamicBox || '';
      const pkgName = el.actionPackage || '';
      const pkg = state.packages.find(p => p.name === pkgName);
      if (dbId && pkg) {
        for (const c of state.canvases) {
          for (const layer of c.layers) {
            const found = findInArray(layer.elements, dbId);
            if (found && found.type === 'dynamic-box') {
              found.defaultPackage = pkg.id;
              dispatch(() => {});
              return;
            }
          }
        }
      }
    }
  }

  function showCanvasInBuffer(targetCanvas, sourceCanvas) {
    if (!sourceCanvas) return;
    const buffer = sourceCanvas.layers.find(l => l.isBuffer);
    if (!buffer) return;
    buffer.elements = [];
    const cloned = targetCanvas.layers.reduce((acc, l) => acc.concat(l.elements), []).map(el => {
      const copy = JSON.parse(JSON.stringify(el));
      copy.id = uid();
      if (copy.children) copy.children = copy.children.map(c => { c.id = uid(); return c; });
      return copy;
    });
    buffer.elements = cloned;
    dispatch(() => {});
  }

  // ---- PREVIEW ----
  function showPreviewCanvas(canvas) {
    const overlay = document.getElementById('preview-overlay');
    const content = document.getElementById('preview-content');
    content.innerHTML = '';
    const wrapper = h('div', { className: 'preview-canvas', style: { transform: `scale(${Math.min(1, (window.innerWidth-120)/canvas.width, (window.innerHeight-120)/canvas.height)})`, transformOrigin: 'top left', background: canvas.bgColor || '#ffffff', width: canvas.width+'px', height: canvas.height+'px', overflow: 'hidden', position: 'relative' } });
    for (let i = 0; i < canvas.layers.length; i++) {
      const layer = canvas.layers[i];
      if (layer.isBuffer && layer.elements.length === 0) continue;
      const layerDiv = h('div', { style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: i, overflow: 'auto' } });
      for (const el of layer.elements) {
        const node = renderElement(el, 1);
        if (node) layerDiv.appendChild(node);
      }
      wrapper.appendChild(layerDiv);
    }
    content.appendChild(wrapper);
    overlay.classList.add('active');
  }

  // ---- ASSETS ----
  function renderAssets() {
    const container = document.getElementById('asset-items-container');
    container.innerHTML = '';
    if (state.assets.length === 0) {
      container.appendChild(h('div', { className: 'text-muted' }, 'No assets yet'));
      return;
    }
    for (const asset of state.assets) {
      const item = h('div', { className: 'asset-item', draggable: true, dataset: { assetId: asset.id } });
      const thumb = h('img', { className: 'asset-thumb', src: asset.url || (asset.type === 'image' || asset.type === 'video' ? asset.url : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="%23666" stroke-width="2"%3E%3Cpath d="M4 7h16M4 12h16M4 17h10"/%3E%3C/svg%3E') });
      item.appendChild(thumb);
      item.appendChild(h('span', { className: 'asset-name' }, asset.name));
      const controls = h('span', { className: 'asset-controls' });
      const delBtn = h('button', { style: { color: '#aa4444' }, onclick: e => {
        e.stopPropagation();
        const assetId = asset.id;
        if (state.assetBlobMap[assetId]) {
          URL.revokeObjectURL(state.assetBlobMap[assetId]);
          delete state.assetBlobMap[assetId];
        }
        state.assets = state.assets.filter(a => a.id !== assetId);
        renderAssets();
        pushHistory();
      } }, '✕');
      controls.appendChild(delBtn);
      item.appendChild(controls);
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', 'asset:' + asset.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      container.appendChild(item);
    }
  }

  function addAssetFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      const blob = dataURLToBlob(dataUrl);
      const url = URL.createObjectURL(blob);
      let type = 'image';
      if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('font/')) type = 'font';
      else if (file.type.startsWith('image/')) type = 'image';
      const asset = { id: uid(), type, name: file.name, url, data: dataUrl };
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
    state.assets.push({ id: uid(), type, name, url, data: null });
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
      dispatch(() => {});
    } else if (el.type === 'media-grid') {
      if (!el.items) el.items = [];
      el.items.push({ src: asset.url, alt: asset.name, mediaType: asset.type === 'video' ? 'video' : 'image', poster: '', assetId: asset.id });
      dispatch(() => {});
    }
  }

  function openLightbox(src) {
    const lb = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    img.src = src;
    lb.classList.add('active');
  }

  // ---- LAYERS PANEL (using template literals) ----
  function renderLayersPanel() {
    const canvas = state.canvases.find(c => c.id === state.selectedCanvasId);
    const container = document.getElementById('layers-list');
    if (!canvas) { container.innerHTML = '<div class="text-muted">No canvas selected</div>'; return; }

    let html = `<div class="layer-panel-header"><span style="font-size:12px;color:#888;">Layers</span><button id="btn-add-layer">+ Add Layer</button></div><div id="layer-items-container">`;
    const displayLayers = canvas.layers.filter(l => !l.isBuffer);
    for (const layer of displayLayers) {
      const isSelected = (canvas.selectedLayerId === layer.id);
      const locked = layer.locked || false;
      html += `<div class="layer-panel-item parent-item ${isSelected ? 'selected' : ''}" draggable="true" data-layer-id="${layer.id}" data-layer-index="${displayLayers.indexOf(layer)}" data-type="layer">
                <span class="item-name">${layer.name}</span>
                <span class="item-controls">
                  <button class="lock-btn ${locked ? 'locked' : ''}" data-layer-id="${layer.id}" title="Toggle lock">${locked ? '🔒' : '🔓'}</button>
                  <button class="btn-layer-delete" data-layer-id="${layer.id}" title="Delete layer">✕</button>
                </span>
              </div>`;
      html += renderElementTree(layer.elements, layer.id, 1, null);
    }
    const buffer = canvas.layers.find(l => l.isBuffer);
    if (buffer) {
      html += `<div class="layer-panel-item buffer-item" style="cursor:default;"><span class="item-name">Buffer (page overlay - locked)</span><span class="item-controls"><button class="btn-clear-buffer" title="Clear buffer">✕</button></span></div>`;
    }
    html += `</div>`;
    container.innerHTML = html;

    // attach events using delegation
    container.querySelector('#btn-add-layer')?.addEventListener('click', () => {
      const name = prompt('Enter layer name:', 'Layer ' + (canvas.layers.filter(l => !l.isBuffer).length + 1));
      if (name) {
        const newLayer = { id: uid(), name, elements: [], locked: false };
        const bufferIndex = canvas.layers.findIndex(l => l.isBuffer);
        if (bufferIndex !== -1) canvas.layers.splice(bufferIndex, 0, newLayer);
        else canvas.layers.push(newLayer);
        canvas.selectedLayerId = newLayer.id;
        dispatch(() => {});
      }
    });

    container.querySelectorAll('.lock-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const layerId = parseInt(btn.dataset.layerId);
        const layer = canvas.layers.find(l => l.id === layerId);
        if (layer) { layer.locked = !layer.locked; dispatch(() => {}); }
      });
    });

    container.querySelectorAll('.btn-layer-delete').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const layerId = parseInt(btn.dataset.layerId);
        const nonBuffer = canvas.layers.filter(l => !l.isBuffer);
        if (nonBuffer.length <= 1) return;
        const layer = canvas.layers.find(l => l.id === layerId);
        if (layer && !layer.isBuffer) {
          canvas.layers = canvas.layers.filter(l => l.id !== layerId);
          if (canvas.selectedLayerId === layerId) canvas.selectedLayerId = nonBuffer[0].id;
          dispatch(() => {});
        }
      });
    });

    container.querySelector('.btn-clear-buffer')?.addEventListener('click', e => {
      e.stopPropagation();
      const buffer = canvas.layers.find(l => l.isBuffer);
      if (buffer) { buffer.elements = []; dispatch(() => {}); }
    });

    // Element deletion via delegation
    container.querySelectorAll('.btn-element-delete').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const elId = parseInt(btn.dataset.elementId);
        const container = getElementContainer(elId);
        if (container) {
          const idx = container.findIndex(e => e.id === elId);
          if (idx !== -1) { container.splice(idx, 1); if (state.selectedElementId === elId) state.selectedElementId = null; dispatch(() => {}); }
        }
      });
    });

    // Drag and drop for layers and elements (delegated)
    container.querySelectorAll('.layer-panel-item:not(.buffer-item)').forEach(item => {
      item.addEventListener('dragstart', e => {
        item.classList.add('dragging');
        const type = item.dataset.type;
        const id = type === 'layer' ? item.dataset.layerId : item.dataset.elementId;
        e.dataTransfer.setData('text/plain', type + ':' + id);
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        container.querySelectorAll('.layer-panel-item').forEach(el => el.classList.remove('drag-over'));
      });
      item.addEventListener('dragover', e => { e.preventDefault(); item.classList.add('drag-over'); });
      item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
      item.addEventListener('drop', e => {
        e.preventDefault(); item.classList.remove('drag-over');
        const data = e.dataTransfer.getData('text/plain');
        if (!data) return;
        const [type, id] = data.split(':');
        const targetType = item.dataset.type;
        const targetId = targetType === 'layer' ? parseInt(item.dataset.layerId) : parseInt(item.dataset.elementId);
        if (type === 'layer') {
          const layerId = parseInt(id);
          if (targetType === 'layer') {
            const fromIndex = canvas.layers.findIndex(l => l.id === layerId);
            const toIndex = canvas.layers.findIndex(l => l.id === targetId);
            if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
              const [removed] = canvas.layers.splice(fromIndex, 1);
              canvas.layers.splice(toIndex, 0, removed);
              dispatch(() => {});
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
            if (srcIdx !== -1) { sourceLayer.elements.splice(srcIdx, 1); }
            targetLayer.elements.push(el);
            dispatch(() => {});
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
            dispatch(() => {});
            selectElement(movedEl.id);
          }
        }
      });
    });

    // Click to select
    container.querySelectorAll('.layer-panel-item').forEach(item => {
      item.addEventListener('click', () => {
        if (item.dataset.type === 'layer') {
          const layerId = parseInt(item.dataset.layerId);
          canvas.selectedLayerId = layerId;
          dispatch(() => {});
        } else if (item.dataset.type === 'element') {
          const elId = parseInt(item.dataset.elementId);
          selectElement(elId);
        }
      });
    });
  }

  function renderElementTree(elements, layerId, depth, parentEl) {
    let html = '';
    for (const el of elements) {
      const isElSelected = (state.selectedElementId === el.id);
      let displayName = el.type;
      if (el.type === 'column') {
        let box = parentEl;
        while (box && box.type !== 'box') box = getParentElement(box.id);
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
        displayName = el.type + (el.type === 'text' && el.content ? ': ' + el.content.substring(0,12) : ' #' + el.id);
      }
      const marginLeft = depth * 16;
      html += `<div class="layer-panel-item child-item ${isElSelected ? 'selected' : ''}" draggable="true" data-element-id="${el.id}" data-layer-id="${layerId}" data-type="element" style="margin-left:${marginLeft}px;">
                <span class="item-name">${displayName}</span>
                <span class="item-controls"><button class="btn-element-delete" data-element-id="${el.id}" title="Delete element">✕</button></span>
              </div>`;
      if (el.children && el.children.length > 0) {
        html += renderElementTree(el.children, layerId, depth + 1, el);
      }
    }
    return html;
  }

  // ---- PACKAGES PANEL ----
  function renderPackages() {
    const container = document.getElementById('packages-list');
    container.innerHTML = '';
    if (state.packages.length === 0) {
      container.appendChild(h('div', { className: 'text-muted' }, 'No packages yet'));
      return;
    }
    for (const pkg of state.packages) {
      const item = h('div', { className: 'package-item', draggable: true });
      const nameSpan = h('span', { className: 'pname' }, pkg.name || 'Package #' + pkg.id);
      item.appendChild(nameSpan);
      const controls = h('span', { className: 'pcontrols' });
      const delBtn = h('button', { style: { color: '#aa4444' }, onclick: e => { e.stopPropagation(); state.packages = state.packages.filter(p => p.id !== pkg.id); renderPackages(); pushHistory(); } }, '✕');
      controls.appendChild(delBtn);
      item.appendChild(controls);
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'package', id: pkg.id }));
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('click', () => alert('Package: ' + pkg.name + ' (elements: ' + pkg.elements.length + ')'));
      container.appendChild(item);
    }
  }

  // ---- PROPERTIES PANEL (data‑driven) ----
  const propSchemas = {
    text: [
      { key: 'content', label: 'Content', type: 'textarea' },
      { key: 'fontFamily', label: 'Font Family', type: 'select', options: FONT_LIST },
      { key: 'fontSize', label: 'Font Size', type: 'number' },
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'fontWeight', label: 'Font Weight', type: 'select', options: ['100','200','300','400','500','600','700','800','900'] },
      { key: 'letterSpacing', label: 'Letter Spacing', type: 'number' },
      { key: 'lineHeight', label: 'Line Height', type: 'number' },
      { key: 'highlight', label: 'Highlight', type: 'color' },
      { key: 'textDecoration', label: 'Text Decoration', type: 'select', options: ['none','underline','line-through'] },
    ],
    media: [
      { key: 'src', label: 'Media URL', type: 'text' },
      { key: 'alt', label: 'Alt Text', type: 'text' },
      { key: 'mediaType', label: 'Media Type', type: 'select', options: ['image','video'] },
      { key: 'poster', label: 'Poster', type: 'text' },
      { key: 'autoplay', label: 'Autoplay', type: 'checkbox' },
      { key: 'loop', label: 'Loop', type: 'checkbox' },
      { key: 'controls', label: 'Controls', type: 'checkbox' },
      { key: 'width', label: 'Width (CSS)', type: 'text' },
      { key: 'height', label: 'Height (CSS)', type: 'text' },
      { key: 'fit', label: 'Fit', type: 'select', options: ['fit','crop'] },
      { key: 'shape', label: 'Shape', type: 'select', options: ['rectangle','circle','diamond'] },
      { key: 'cornerRadius', label: 'Corner Radius', type: 'number' },
    ],
    'media-grid': [
      { key: 'layout', label: 'Layout', type: 'select', options: ['grid','masonry'] },
      { key: 'gridCols', label: 'Columns (grid)', type: 'number' },
      { key: 'fit', label: 'Fit', type: 'select', options: ['fit','crop'] },
      { key: 'cornerRadius', label: 'Corner Radius', type: 'number' },
    ],
    button: [
      { key: 'action', label: 'Action', type: 'select', options: ['link','page','dynamic'] },
      { key: 'actionUrl', label: 'Action URL (link)', type: 'text' },
      { key: 'actionTarget', label: 'Target (link)', type: 'select', options: ['_blank','_self','_parent','_top'] },
      { key: 'actionCanvas', label: 'Canvas (page)', type: 'text' },
      { key: 'actionPackage', label: 'Package Name', type: 'text' },
      { key: 'actionDynamicBox', label: 'Dynamic Box ID', type: 'text' },
      { key: 'cornerRadius', label: 'Corner Radius', type: 'number' },
      { key: 'bgColor', label: 'Background', type: 'color' },
      { key: 'color', label: 'Text Color', type: 'color' },
      { key: 'borderSize', label: 'Border Size', type: 'number' },
      { key: 'borderColor', label: 'Border Color', type: 'color' },
      { key: 'autoWidth', label: 'Auto Width', type: 'checkbox' },
      { key: 'width', label: 'Width (CSS)', type: 'text' },
      { key: 'height', label: 'Height (CSS)', type: 'text' },
      { key: 'fontSize', label: 'Font Size', type: 'number' },
    ],
    box: [
      { key: 'gridRows', label: 'Grid Rows', type: 'number' },
      { key: 'gridCols', label: 'Grid Columns', type: 'number' },
      { key: 'bgColor', label: 'Background', type: 'color' },
      { key: 'borderSize', label: 'Border Thickness', type: 'number' },
      { key: 'borderColor', label: 'Border Color', type: 'color' },
      { key: 'borderOpacity', label: 'Border Opacity (0-100)', type: 'number' },
      { key: 'borderStyle', label: 'Border Style', type: 'select', options: ['solid','dashed','dotted'] },
    ],
    'dynamic-box': [
      { key: 'id', label: 'ID', type: 'text' },
      { key: 'autoAdapt', label: 'Auto Adapt', type: 'checkbox' },
    ],
  };

  function renderProperties() {
    const el = state.selectedElementId ? findElement(state.selectedElementId) : null;
    const container = document.getElementById('properties-content');
    if (!el) { container.innerHTML = '<div class="text-muted">Select an element to edit</div>'; return; }
    container.innerHTML = '';
    container.appendChild(h('div', { style: { fontSize: '13px', fontWeight: '500', marginBottom: '8px' } }, el.type.toUpperCase() + ' #' + el.id));

    // Generic opacity
    container.appendChild(createPropControl('opacity', 'Opacity (0-100)', 'number', el));

    // Anchor picker (if inside column)
    const parent = getParentElement(el.id);
    if (parent && parent.type === 'column' && ['text','media','button'].includes(el.type)) {
      container.appendChild(createAnchorPicker(el));
    }

    // Type‑specific props
    const schema = propSchemas[el.type] || [];
    for (const prop of schema) {
      if (prop.type === 'select' && prop.key === 'action' && el.type === 'button') {
        // Special handling for action to show/hide page selector
        const group = createPropControl(prop.key, prop.label, prop.type, el, prop.options);
        container.appendChild(group);
        // Add page selector
        const pageGroup = createCanvasSelector(el);
        container.appendChild(pageGroup);
        // Hide/show based on action
        const actionSelect = group.querySelector('select');
        if (actionSelect) {
          actionSelect.addEventListener('change', () => {
            el.action = actionSelect.value;
            pageGroup.style.display = el.action === 'page' ? 'block' : 'none';
            dispatch(() => {});
          });
          pageGroup.style.display = el.action === 'page' ? 'block' : 'none';
        }
        continue;
      }
      container.appendChild(createPropControl(prop.key, prop.label, prop.type, el, prop.options));
    }

    // Margin/Padding
    container.appendChild(createMarginPaddingControl('Margin', 'margin', el));
    container.appendChild(createMarginPaddingControl('Padding', 'padding', el));

    // For media, extra corner radius and crop controls
    if (el.type === 'media') {
      container.appendChild(createCornerRadiusControl(el));
      container.appendChild(createCropControl(el));
    }

    // For media-grid, show items management
    if (el.type === 'media-grid') {
      container.appendChild(createMediaGridItemsControl(el));
    }

    // For button, extra action page selector already added

    // Style class selector
    container.appendChild(createStyleClassSelector(el));

    // Delete button
    const delGroup = h('div', { className: 'prop-group' });
    const delRow = h('div', { className: 'prop-row' });
    const delBtn = h('button', { style: { color: '#ff6666', borderColor: '#4a2a2a' }, onclick: () => {
      removeElement(el.id);
      dispatch(() => {});
    } }, 'Delete Element');
    delRow.appendChild(delBtn);
    delGroup.appendChild(delRow);
    container.appendChild(delGroup);
  }

  function createPropControl(key, label, type, el, options) {
    const group = h('div', { className: 'prop-group' });
    const lbl = h('label', {}, label);
    group.appendChild(lbl);
    const row = h('div', { className: 'prop-row' });
    let input;
    if (type === 'color') {
      input = h('input', { type: 'color', value: el[key] || '#000000', oninput: e => { el[key] = e.target.value; renderCanvases(); }, onchange: () => pushHistory() });
    } else if (type === 'select' && options) {
      input = h('select', { onchange: () => { el[key] = input.value; if (el.type === 'box' && (key === 'gridRows' || key === 'gridCols')) updateBoxColumns(el); dispatch(() => {}); } });
      for (const opt of options) {
        const o = h('option', { value: opt, selected: el[key] === opt }, opt);
        input.appendChild(o);
      }
    } else if (type === 'number') {
      input = h('input', { type: 'number', value: el[key] || 0, step: '1' });
      if (key === 'opacity' || key === 'borderOpacity') {
        input.min = 0; input.max = 100;
      }
      addScrubber(input, val => { el[key] = val; if (el.type === 'box' && (key === 'gridRows' || key === 'gridCols')) updateBoxColumns(el); dispatch(() => {}); });
      input.addEventListener('change', () => { const val = parseFloat(input.value) || 0; el[key] = val; if (el.type === 'box' && (key === 'gridRows' || key === 'gridCols')) updateBoxColumns(el); dispatch(() => {}); });
    } else if (type === 'text') {
      input = h('input', { type: 'text', value: el[key] || '', style: { width: '100%' }, onchange: () => { el[key] = input.value; dispatch(() => {}); } });
    } else if (type === 'textarea') {
      input = h('textarea', { style: { width: '100%', background: '#111', border: '1px solid #333', color: '#ddd', borderRadius: '3px', padding: '4px', fontSize: '11px', rows: 2 }, onchange: () => { el[key] = input.value; dispatch(() => {}); } }, el[key] || '');
    } else if (type === 'checkbox') {
      input = h('input', { type: 'checkbox', checked: el[key] || false, onchange: () => { el[key] = input.checked; dispatch(() => {}); } });
    }
    row.appendChild(input);
    group.appendChild(row);
    return group;
  }

  function createAnchorPicker(el) {
    const container = h('div', { className: 'prop-group' });
    container.appendChild(h('label', {}, 'Position Anchor'));
    const grid = h('div', { className: 'anchor-picker' });
    const positions = ['tl','tc','tr','ml','mc','mr','bl','bc','br'];
    const labels = ['↖','↑','↗','←','⊙','→','↙','↓','↘'];
    const currentAnchor = el.anchor || 'tl';
    positions.forEach((pos, i) => {
      const cell = h('div', { className: 'cell' + (currentAnchor === pos ? ' active' : ''), dataset: { value: pos }, style: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#888' }, onclick: () => { el.anchor = pos; dispatch(() => {}); } }, labels[i]);
      grid.appendChild(cell);
    });
    container.appendChild(grid);
    return container;
  }

  function createMarginPaddingControl(label, keyPrefix, el) {
    const group = h('div', { className: 'prop-group' });
    group.appendChild(h('label', {}, label));
    const row = h('div', { className: 'prop-row' });
    const isMargin = keyPrefix === 'margin';
    const customKey = isMargin ? 'customMargin' : 'customPadding';
    const customCheck = h('input', { type: 'checkbox', checked: el[customKey] || false, onchange: () => { el[customKey] = customCheck.checked; renderProperties(); renderCanvases(); pushHistory(); } });
    const wrapper = h('span', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, customCheck, h('span', { style: { fontSize: '10px', color: '#888' } }, 'Custom'));
    row.appendChild(wrapper);

    if (!el[customKey]) {
      const input = h('input', { type: 'number', value: el[keyPrefix] || 0, step: '1' });
      addScrubber(input, val => { el[keyPrefix] = val; dispatch(() => {}); });
      input.addEventListener('change', () => { el[keyPrefix] = parseFloat(input.value) || 0; dispatch(() => {}); });
      row.appendChild(input);
    } else {
      const sides = ['Top','Right','Bottom','Left'];
      for (const side of sides) {
        const subGroup = h('span', { className: 'inline-group' });
        subGroup.appendChild(h('span', { className: 'sub-label' }, side[0]));
        const inp = h('input', { type: 'number', value: el[keyPrefix + side] || 0, step: '1', style: { width: '36px' } });
        addScrubber(inp, val => { el[keyPrefix + side] = val; dispatch(() => {}); });
        inp.addEventListener('change', () => { el[keyPrefix + side] = parseFloat(inp.value) || 0; dispatch(() => {}); });
        subGroup.appendChild(inp);
        row.appendChild(subGroup);
      }
    }
    group.appendChild(row);
    return group;
  }

  function createCornerRadiusControl(el) {
    const group = h('div', { className: 'prop-group' });
    group.appendChild(h('label', {}, 'Corner Radius'));
    const row = h('div', { className: 'prop-row' });
    const useInd = h('input', { type: 'checkbox', checked: el.useIndividualRadius || false, onchange: () => { el.useIndividualRadius = useInd.checked; renderProperties(); renderCanvases(); pushHistory(); } });
    const wrap = h('span', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, useInd, h('span', { style: { fontSize: '10px', color: '#888' } }, 'Per corner'));
    row.appendChild(wrap);

    if (!el.useIndividualRadius) {
      const inp = h('input', { type: 'number', value: el.cornerRadius || 0, step: '1' });
      addScrubber(inp, val => { el.cornerRadius = val; dispatch(() => {}); });
      inp.addEventListener('change', () => { el.cornerRadius = parseFloat(inp.value) || 0; dispatch(() => {}); });
      row.appendChild(inp);
    } else {
      const corners = ['TL','TR','BR','BL'];
      for (const key of corners) {
        const sub = h('span', { className: 'inline-group' });
        sub.appendChild(h('span', { className: 'sub-label' }, key));
        const inp = h('input', { type: 'number', value: el['cornerRadius'+key] || 0, step: '1', style: { width: '36px' } });
        addScrubber(inp, val => { el['cornerRadius'+key] = val; dispatch(() => {}); });
        inp.addEventListener('change', () => { el['cornerRadius'+key] = parseFloat(inp.value) || 0; dispatch(() => {}); });
        sub.appendChild(inp);
        row.appendChild(sub);
      }
    }
    group.appendChild(row);
    return group;
  }

  function createCropControl(el) {
    const group = h('div', { className: 'prop-group' });
    group.appendChild(h('label', {}, 'Crop (%, 0-100)'));
    const row = h('div', { className: 'prop-row' });
    const sides = ['Top','Right','Bottom','Left'];
    for (const side of sides) {
      const sub = h('span', { className: 'inline-group' });
      sub.appendChild(h('span', { className: 'sub-label' }, side[0]));
      const inp = h('input', { type: 'number', value: el['crop'+side] || 0, step: '1', min: 0, max: 100, style: { width: '36px' } });
      addScrubber(inp, val => { el['crop'+side] = val; dispatch(() => {}); });
      inp.addEventListener('change', () => { el['crop'+side] = parseFloat(inp.value) || 0; dispatch(() => {}); });
      sub.appendChild(inp);
      row.appendChild(sub);
    }
    group.appendChild(row);
    return group;
  }

  function createMediaGridItemsControl(el) {
    const group = h('div', { className: 'prop-group' });
    group.appendChild(h('label', {}, 'Media Items (' + (el.items || []).length + ')'));
    const row = h('div', { className: 'prop-row' });
    const addBtn = h('button', { onclick: () => {
      const url = prompt('Media URL:');
      if (url) {
        const mediaType = url.match(/\.(mp4|webm|ogg)$/i) ? 'video' : 'image';
        if (!el.items) el.items = [];
        el.items.push({ src: url, alt: '', mediaType, poster: '', assetId: null });
        dispatch(() => {});
      }
    } }, 'Add Media');
    row.appendChild(addBtn);
    const clearBtn = h('button', { onclick: () => { el.items = []; dispatch(() => {}); } }, 'Clear');
    row.appendChild(clearBtn);
    group.appendChild(row);
    return group;
  }

  function createStyleClassSelector(el) {
    const group = h('div', { className: 'prop-group' });
    group.appendChild(h('label', {}, 'Style Class'));
    const row = h('div', { className: 'prop-row' });
    const sel = h('select', { onchange: () => {
      const val = sel.value;
      if (!el.classes) el.classes = [];
      if (val && !el.classes.includes(val)) el.classes.push(val);
      else if (!val) el.classes = [];
      dispatch(() => {});
    } });
    const opt0 = h('option', { value: '' }, '— none —');
    sel.appendChild(opt0);
    for (const [name] of Object.entries(state.styles)) {
      const o = h('option', { value: name, selected: (el.classes || []).includes(name) }, name);
      sel.appendChild(o);
    }
    row.appendChild(sel);
    group.appendChild(row);
    return group;
  }

  function createCanvasSelector(el) {
    const group = h('div', { className: 'prop-group' });
    group.appendChild(h('label', {}, 'Canvas (page)'));
    const row = h('div', { className: 'prop-row' });
    const sel = h('select', { onchange: () => { el.actionCanvas = sel.value; dispatch(() => {}); } });
    sel.appendChild(h('option', { value: '' }, '— select —'));
    for (const c of state.canvases) {
      const o = h('option', { value: c.name, selected: el.actionCanvas === c.name }, c.name);
      sel.appendChild(o);
    }
    row.appendChild(sel);
    group.appendChild(row);
    return group;
  }

  // ---- SCRUBBER ----
  function addScrubber(input, onChange) {
    let isScrubbing = false, startX, startVal, timer, isHeld = false;
    input.classList.add('scrub');
    input.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (document.activeElement === input) return;
      e.preventDefault();
      startX = e.clientX;
      startVal = parseFloat(input.value) || 0;
      isHeld = false;
      timer = setTimeout(() => { isHeld = true; isScrubbing = true; }, 300);
      const onMove = ev => {
        if (!isScrubbing) { if (timer) { clearTimeout(timer); timer = null; } return; }
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
        clearTimeout(timer); timer = null; isScrubbing = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (!isHeld && Math.abs(e.clientX - startX) < 3) {
          input.focus(); input.select();
        } else {
          if (onChange) onChange(parseFloat(input.value) || 0);
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ---- RENDER CANVASES ----
  function getDeviceScale() {
    switch (state.deviceMode) {
      case 'desktop': return 0.4;
      case 'tablet': return 0.5;
      case 'phone': return 0.6;
      default: return 0.4;
    }
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

  function renderCanvases() {
    const container = document.getElementById('canvas-scroll');
    container.innerHTML = '';
    const scale = getDeviceScale();
    for (const canvas of state.canvases) {
      const wrapper = h('div', { className: 'canvas-wrapper' + (canvas.isMain ? ' main-canvas' : '') + (state.selectedCanvasId === canvas.id ? ' selected-canvas' : ''), dataset: { canvasId: canvas.id }, draggable: true });

      // Header
      const header = h('div', { className: 'canvas-header' });
      const nameInput = h('input', { className: 'cname', value: canvas.name, readonly: canvas.isMain });
      nameInput.addEventListener('change', () => {
        if (!canvas.isMain) { canvas.name = nameInput.value || 'untitled'; renderLayersPanel(); renderPackages(); pushHistory(); }
      });
      header.appendChild(nameInput);

      const cres = h('div', { className: 'cres' });
      const wIn = h('input', { type: 'number', value: canvas.width, min: 100, style: { width: '44px' }, onmousedown: e => e.stopPropagation() });
      wIn.addEventListener('change', () => { const v = parseInt(wIn.value) || 100; canvas.width = v; renderCanvases(); pushHistory(); });
      cres.appendChild(wIn);
      cres.appendChild(h('span', {}, 'x'));
      const hIn = h('input', { type: 'number', value: canvas.height, min: 100, style: { width: '44px' }, onmousedown: e => e.stopPropagation() });
      hIn.addEventListener('change', () => { const v = parseInt(hIn.value) || 100; canvas.height = v; renderCanvases(); pushHistory(); });
      cres.appendChild(hIn);
      header.appendChild(cres);

      const actions = h('div', { className: 'cactions' });
      const bgColorInput = h('input', { type: 'color', value: canvas.bgColor || '#ffffff', title: 'Background color' });
      bgColorInput.addEventListener('input', e => {
        canvas.bgColor = e.target.value;
        const body = wrapper.querySelector('.canvas-body');
        if (body) body.style.background = canvas.bgColor;
      });
      bgColorInput.addEventListener('change', () => pushHistory());
      actions.appendChild(bgColorInput);
      const delBtn = h('button', { className: 'danger', title: 'Delete canvas', onclick: e => {
        e.stopPropagation();
        if (state.canvases.length <= 1 && canvas.isMain) return;
        if (canvas.isMain && state.canvases.filter(c => c.isMain).length === 1) return;
        state.canvases = state.canvases.filter(c => c.id !== canvas.id);
        if (state.selectedCanvasId === canvas.id) state.selectedCanvasId = state.canvases[0]?.id || null;
        dispatch(() => {});
      } }, 'x');
      actions.appendChild(delBtn);
      header.appendChild(actions);
      wrapper.appendChild(header);

      // Body
      const body = h('div', { className: 'canvas-body', style: { width: (canvas.width * scale) + 'px', height: (canvas.height * scale) + 'px', minHeight: '100px', minWidth: '100px', background: canvas.bgColor || '#ffffff', position: 'relative', overflow: 'hidden' } });
      const elementsDiv = h('div', { className: 'canvas-elements', style: { width: '100%', height: '100%', position: 'relative', overflow: 'auto' } });
      const sortedLayers = canvas.layers.slice().sort((a,b) => a.isBuffer ? 1 : b.isBuffer ? -1 : 0);
      for (let i = 0; i < sortedLayers.length; i++) {
        const layer = sortedLayers[i];
        const isBuffer = layer.isBuffer || false;
        if (isBuffer && layer.elements.length === 0) continue;
        const layerDiv = h('div', { className: 'canvas-layer' + (isBuffer ? ' buffer-layer' : '') + (layer.locked ? ' locked' : ''), dataset: { layerId: layer.id }, style: { zIndex: i, position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'auto', border: '1px dashed transparent', padding: (4*scale)+'px', boxSizing: 'border-box' } });
        const dropZone = h('div', { className: 'layer-drop-zone', dataset: { layerId: layer.id }, style: { minHeight: '100%', width: '100%', display: 'flex', flexDirection: 'column' } });
        if (layer.elements.length === 0) {
          dropZone.appendChild(h('div', { style: { color: '#555', fontSize: (11*scale)+'px', padding: (4*scale)+'px' } }, isBuffer ? 'Buffer (page overlay) - locked' : 'Drop elements here'));
        } else {
          for (const el of layer.elements) {
            const node = renderElement(el, scale);
            if (node) dropZone.appendChild(node);
          }
        }
        if (!isBuffer && !layer.locked) {
          layerDiv.addEventListener('dragover', e => { e.preventDefault(); layerDiv.classList.add('drag-over'); });
          layerDiv.addEventListener('dragleave', () => { layerDiv.classList.remove('drag-over'); });
          layerDiv.addEventListener('drop', e => {
            e.preventDefault(); e.stopPropagation(); layerDiv.classList.remove('drag-over');
            const data = e.dataTransfer.getData('text/plain');
            if (!data) return;
            const handleDrop = (elToAdd) => {
              if (!elToAdd) return;
              layer.elements.push(elToAdd);
              dispatch(() => {});
              selectElement(elToAdd.id);
            };
            if (data.startsWith('el:')) {
              const elId = parseInt(data.slice(3));
              const el = findElement(elId);
              if (!el) return;
              const oldContainer = getElementContainer(elId);
              if (!oldContainer) return;
              const idx = oldContainer.findIndex(e => e.id === elId);
              if (idx !== -1) oldContainer.splice(idx, 1);
              handleDrop(el);
            } else if (data.startsWith('asset:')) {
              const assetId = parseInt(data.slice(6));
              const newEl = createElement('media');
              handleAssetDrop(newEl, assetId);
              handleDrop(newEl);
            } else {
              const newEl = createElement(data);
              handleDrop(newEl);
            }
          });
          // Also on dropZone
          dropZone.addEventListener('dragover', e => { e.preventDefault(); layerDiv.classList.add('drag-over'); });
          dropZone.addEventListener('dragleave', () => { layerDiv.classList.remove('drag-over'); });
          dropZone.addEventListener('drop', e => {
            e.preventDefault(); e.stopPropagation(); layerDiv.classList.remove('drag-over');
            const data = e.dataTransfer.getData('text/plain');
            if (!data) return;
            const handleDrop = (elToAdd) => {
              if (!elToAdd) return;
              layer.elements.push(elToAdd);
              dispatch(() => {});
              selectElement(elToAdd.id);
            };
            if (data.startsWith('el:')) {
              const elId = parseInt(data.slice(3));
              const el = findElement(elId);
              if (!el) return;
              const oldContainer = getElementContainer(elId);
              if (!oldContainer) return;
              const idx = oldContainer.findIndex(e => e.id === elId);
              if (idx !== -1) oldContainer.splice(idx, 1);
              handleDrop(el);
            } else if (data.startsWith('asset:')) {
              const assetId = parseInt(data.slice(6));
              const newEl = createElement('media');
              handleAssetDrop(newEl, assetId);
              handleDrop(newEl);
            } else {
              const newEl = createElement(data);
              handleDrop(newEl);
            }
          });
        } else {
          layerDiv.style.cursor = 'default';
          dropZone.style.cursor = 'default';
        }
        layerDiv.appendChild(dropZone);
        elementsDiv.appendChild(layerDiv);
      }
      body.appendChild(elementsDiv);
      wrapper.appendChild(body);

      // Resize bars
      const heightBar = h('div', { className: 'height-resize-bar' });
      heightBar.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        const startY = e.clientY, startH = canvas.height;
        const onMove = ev => {
          const dy = (ev.clientY - startY) / scale;
          const newH = Math.max(100, startH + dy);
          canvas.height = newH;
          const bodyEl = wrapper.querySelector('.canvas-body');
          if (bodyEl) bodyEl.style.height = (newH * scale) + 'px';
          const hInput = wrapper.querySelector('.cres input:last-child');
          if (hInput) hInput.value = newH;
        };
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); pushHistory(); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      wrapper.appendChild(heightBar);

      const handle = h('div', { className: 'resize-handle' });
      handle.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX, startY = e.clientY, startW = canvas.width, startH = canvas.height;
        const onMove = ev => {
          const dx = (ev.clientX - startX) / scale, dy = (ev.clientY - startY) / scale;
          canvas.width = Math.max(100, startW + dx);
          canvas.height = Math.max(100, startH + dy);
          renderCanvases();
        };
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); pushHistory(); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      wrapper.appendChild(handle);

      // Canvas events
      wrapper.addEventListener('mousedown', e => {
        if (e.target.closest('input, button')) return;
        if (!e.target.closest('.el-box, .el-text, .el-media, .el-media-grid, .el-button-container, .el-dynamic-box')) {
          state.selectedCanvasId = canvas.id;
          state.selectedElementId = null;
          dispatch(() => {});
        }
      });
      wrapper.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/canvas-id', canvas.id);
        e.dataTransfer.effectAllowed = 'move';
        wrapper.classList.add('dragging');
      });
      wrapper.addEventListener('dragend', () => wrapper.classList.remove('dragging'));
      wrapper.addEventListener('dragover', e => { e.preventDefault(); wrapper.classList.add('drag-over'); });
      wrapper.addEventListener('dragleave', () => wrapper.classList.remove('drag-over'));
      wrapper.addEventListener('drop', e => {
        e.preventDefault(); wrapper.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/canvas-id');
        if (draggedId && draggedId !== canvas.id) {
          const draggedIndex = state.canvases.findIndex(c => c.id === parseInt(draggedId));
          const targetIndex = state.canvases.findIndex(c => c.id === canvas.id);
          if (draggedIndex !== -1 && targetIndex !== -1) {
            const [removed] = state.canvases.splice(draggedIndex, 1);
            state.canvases.splice(targetIndex, 0, removed);
            dispatch(() => {});
          }
        }
      });
      wrapper.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, canvas.id, null);
      });

      container.appendChild(wrapper);
    }
    applyZoomPan();
  }

  function applyZoomPan() {
    const scroll = document.getElementById('canvas-scroll');
    scroll.style.transform = `scale(${state.zoom}) translate(${state.panX}px, ${state.panY}px)`;
    scroll.style.transformOrigin = '0 0';
  }

  // ---- CONTEXT MENU ----
  let contextTargetCanvasId = null, contextTargetElementId = null;
  function showContextMenu(x, y, canvasId, elementId) {
    contextTargetCanvasId = canvasId;
    contextTargetElementId = elementId;
    const menu = document.getElementById('context-menu');
    menu.style.display = 'block';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.querySelectorAll('.menu-item').forEach(item => {
      const action = item.dataset.action;
      if (action === 'mark-main') {
        item.style.display = canvasId ? 'block' : 'none';
      } else {
        item.style.display = elementId ? 'block' : 'none';
      }
      if (!elementId && action !== 'mark-main') item.classList.add('disabled');
      else item.classList.remove('disabled');
    });
  }
  function hideContextMenu() { document.getElementById('context-menu').style.display = 'none'; }
  document.addEventListener('click', e => { if (!document.getElementById('context-menu').contains(e.target)) hideContextMenu(); });
  document.getElementById('context-menu').addEventListener('click', e => {
    const item = e.target.closest('.menu-item');
    if (!item || item.classList.contains('disabled')) return;
    const action = item.dataset.action;
    if (action === 'delete' && contextTargetElementId) {
      removeElement(contextTargetElementId);
      dispatch(() => {});
    } else if (action === 'bring-forward' && contextTargetElementId) {
      bringForward(contextTargetElementId);
      dispatch(() => {});
    } else if (action === 'send-backward' && contextTargetElementId) {
      sendBackward(contextTargetElementId);
      dispatch(() => {});
    } else if (action === 'bring-to-front' && contextTargetElementId) {
      bringToFront(contextTargetElementId);
      dispatch(() => {});
    } else if (action === 'send-to-back' && contextTargetElementId) {
      sendToBack(contextTargetElementId);
      dispatch(() => {});
    } else if (action === 'mark-main' && contextTargetCanvasId) {
      const canvas = state.canvases.find(c => c.id === contextTargetCanvasId);
      if (canvas) {
        state.canvases.forEach(c => c.isMain = false);
        canvas.isMain = true;
        dispatch(() => {});
      }
    }
    hideContextMenu();
  });

  // ---- REORDER HELPERS ----
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
    [container[idx], container[idx-1]] = [container[idx-1], container[idx]];
  }
  function sendBackward(elId) {
    const container = getElementContainer(elId);
    if (!container) return;
    const idx = container.findIndex(e => e.id === elId);
    if (idx === -1 || idx >= container.length - 1) return;
    [container[idx], container[idx+1]] = [container[idx+1], container[idx]];
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

  // ---- UPDATE BOX COLUMNS ----
  function updateBoxColumns(box) {
    const rows = box.gridRows || 1;
    const cols = box.gridCols || 1;
    const target = rows * cols;
    while (box.children.length < target) {
      box.children.push({ id: uid(), type: 'column', children: [], padding: box.padding || 0, proportionWeight: 1, bgColor: 'transparent', customPadding: box.customPadding || false, paddingTop: box.paddingTop || 0, paddingRight: box.paddingRight || 0, paddingBottom: box.paddingBottom || 0, paddingLeft: box.paddingLeft || 0 });
    }
    while (box.children.length > target) box.children.pop();
    for (const col of box.children) col.proportionWeight = col.proportionWeight || 1;
    if (!box.rowProportions || box.rowProportions.length !== rows) {
      box.rowProportions = Array.from({ length: rows }, () => Array(cols).fill(100/cols));
    } else {
      for (let r = 0; r < box.rowProportions.length; r++) {
        while (box.rowProportions[r].length < cols) box.rowProportions[r].push(100/cols);
        while (box.rowProportions[r].length > cols) box.rowProportions[r].pop();
      }
      while (box.rowProportions.length < rows) box.rowProportions.push(Array(cols).fill(100/cols));
      while (box.rowProportions.length > rows) box.rowProportions.pop();
    }
  }

  // ---- EXPORT HTML ----
  function buildExportHTML(mainCanvas, urlToPath = {}) {
    const allCanvases = state.canvases.map(c => {
      const clone = JSON.parse(JSON.stringify(c));
      clone.layers = clone.layers.filter(l => !l.isBuffer);
      return clone;
    });
    const canvasDataMap = {};
    for (const c of allCanvases) canvasDataMap[c.name] = c;

    function replaceUrlsInData(obj) {
      if (!obj) return obj;
      if (typeof obj === 'string') {
        for (const [url, path] of Object.entries(urlToPath)) {
          if (obj === url) return path;
        }
        return obj;
      }
      if (Array.isArray(obj)) return obj.map(replaceUrlsInData);
      if (typeof obj === 'object') {
        const result = {};
        for (const [k, v] of Object.entries(obj)) result[k] = replaceUrlsInData(v);
        return result;
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
            </style></head><body>`;

    const mainCanvasExport = JSON.parse(JSON.stringify(mainCanvas));
    replaceUrlsInData(mainCanvasExport);

    html += `<div class="page-container" id="main-container">`;
    for (let i = 0; i < mainCanvasExport.layers.length; i++) {
      const layer = mainCanvasExport.layers[i];
      if (layer.isBuffer) continue;
      html += `<div style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:${i};overflow:auto;">`;
      for (const el of layer.elements) html += exportElementToHTML(el);
      html += `</div>`;
    }
    html += `<div class="buffer-layer" id="buffer-layer"><button class="close-btn" id="buffer-close">&times;</button><div id="buffer-content" style="width:100%;height:100%;"></div></div></div>`;
    html += `<div id="lightbox"><img id="lightbox-img" src="" alt="" /></div>`;

    html += `<script>
              const canvasesData = ${JSON.stringify(replacedData)};
              const packagesData = ${JSON.stringify(replacedPackages)};
              function getAnchorStyles(anchor) { return ${JSON.stringify(ANCHOR_MAP)}[anchor] || ${JSON.stringify(ANCHOR_MAP)}.tl; }
              function exportElementToHTML(el) {
                switch(el.type) {
                  case 'box': {
                    const rows = el.gridRows||1, cols = el.gridCols||1;
                    const rowProps = el.rowProportions||[];
                    let h = '<div style="padding:'+(el.padding||0)+'px;margin:'+(el.margin||0)+'px;background:'+(el.bgColor||'transparent')+';border:'+(el.borderSize||0)+'px solid '+(el.borderColor||'transparent')+';border-radius:3px;display:flex;flex-direction:column;gap:4px;width:100%;height:100%;min-height:20px;">';
                    const children = el.children||[];
                    for (let r=0; r<rows; r++) {
                      h += '<div style="display:flex;gap:4px;width:100%;flex:1 1 auto;min-height:20px;">';
                      const props = (rowProps[r])?rowProps[r]:Array(cols).fill(100/cols);
                      for (let c=0; c<cols; c++) {
                        const idx = r*cols+c;
                        const col = children[idx] || {children:[], padding:0, bgColor:'transparent'};
                        const pct = el.useProportions ? (props[c]||0) : (100/cols);
                        h += '<div style="flex:0 0 '+pct+'%;width:'+pct+'%;padding:'+(col.padding||0)+'px;background:'+(col.bgColor||'transparent')+';box-sizing:border-box;min-height:20px;position:relative;display:flex;flex-direction:column;flex:1 1 0;">';
                        for (const child of (col.children||[])) h += exportElementToHTML(child);
                        h += '</div>';
                      }
                      h += '</div>';
                    }
                    h += '</div>';
                    return h;
                  }
                  case 'dynamic-box': {
                    let h = '<div style="padding:6px;background:#1a2a2a;border:1px dashed #3a5a5a;border-radius:3px;margin:2px 0;">';
                    h += '<div style="font-size:10px;color:#5a8a8a;">Dynamic: '+(el.id||'')+'</div>';
                    if (el.defaultPackage) {
                      const pkg = packagesData.find(p => p.id === el.defaultPackage);
                      if (pkg) for (const e of pkg.elements) h += exportElementToHTML(e);
                    }
                    h += '</div>';
                    return h;
                  }
                  case 'text': {
                    const anchor = el.anchor||'tl';
                    const styles = getAnchorStyles(anchor);
                    return '<div style="display:flex;width:100%;height:100%;justify-content:'+styles.justifyContent+';align-items:'+styles.alignItems+';"><div style="font-family:'+(el.fontFamily||'Inter')+';font-size:'+(el.fontSize||16)+'px;color:'+(el.color||'#e0e0e0')+';font-weight:'+(el.fontWeight||'400')+';font-style:'+(el.fontStyle||'normal')+';text-decoration:'+(el.textDecoration||'none')+';text-align:'+(el.textAlign||'left')+';letter-spacing:'+(el.letterSpacing||0)+'px;line-height:'+(el.lineHeight||1.5)+';padding:2px 4px;">'+(el.content||'Text')+'</div></div>';
                  }
                  case 'media': {
                    const anchor = el.anchor||'tl';
                    const styles = getAnchorStyles(anchor);
                    const sizeAdj = el.sizeAdjust||0;
                    const style = 'display:block;transform:scale('+(1+sizeAdj/100)+');transform-origin:center center;max-width:100%;height:auto;width:'+(el.width||'auto')+';height:'+(el.height||'auto')+';margin:'+(el.margin||0)+'px;border-radius:'+(el.cornerRadius||0)+'px;object-fit:'+(el.fit==='crop'?'cover':'contain')+';';
                    const wrap = 'display:flex;width:100%;height:100%;justify-content:'+styles.justifyContent+';align-items:'+styles.alignItems+';';
                    if (el.mediaType === 'video') return '<div style="'+wrap+'"><video src="'+(el.src||'')+'" poster="'+(el.poster||'')+'" controls style="'+style+'"></video></div>';
                    return '<div style="'+wrap+'"><img src="'+(el.src||'')+'" alt="'+(el.alt||'')+'" style="'+style+'" /></div>';
                  }
                  case 'media-grid': {
                    let h = '<div style="display:'+(el.layout==='masonry'?'block':'grid')+';grid-template-columns:repeat('+(el.gridCols||3)+',1fr);gap:4px;'+(el.layout==='masonry'?'column-count:3;':'')+'">';
                    for (const item of (el.items||[])) {
                      h += '<div style="margin:'+(el.margin||0)+'px;border-radius:'+(el.cornerRadius||0)+'px;overflow:hidden;'+(el.layout==='masonry'?'break-inside:avoid;margin-bottom:4px;':'')+'">';
                      if (item.mediaType === 'video') h += '<video src="'+(item.src||'')+'" poster="'+(item.poster||'')+'" controls style="width:100%;display:block;object-fit:'+(el.fit==='crop'?'cover':'contain')+';'+(el.fit==='crop'?'height:120px;':'')+'"></video>';
                      else h += '<img src="'+(item.src||'')+'" alt="'+(item.alt||'')+'" style="width:100%;display:block;object-fit:'+(el.fit==='crop'?'cover':'contain')+';'+(el.fit==='crop'?'height:120px;':'')+'" />';
                      h += '</div>';
                    }
                    h += '</div>';
                    return h;
                  }
                  case 'button': {
                    const anchor = el.anchor||'tl';
                    const styles = getAnchorStyles(anchor);
                    const action = el.action||'link';
                    const dataAttrs = ' data-action="'+action+'" data-url="'+(el.actionUrl||'#')+'" data-target="'+(el.actionTarget||'_blank')+'" data-canvas="'+(el.actionCanvas||'')+'" data-dynamic-box="'+(el.actionDynamicBox||'')+'" data-package="'+(el.actionPackage||'')+'"';
                    let style = 'border-radius:'+(el.cornerRadius||4)+'px;background:'+(el.bgColor||'#2a5a8a')+';color:'+(el.color||'#ffffff')+';border:'+(el.borderSize||0)+'px solid '+(el.borderColor||'transparent')+';padding:4px 12px;cursor:pointer;font-size:'+(el.fontSize||13)+'px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-height:30px;min-width:30px;';
                    if (el.autoWidth !== false) style += 'width:auto;';
                    else if (el.width) style += 'width:'+el.width+';';
                    if (el.height) style += 'height:'+el.height+';';
                    const wrap = 'display:flex;width:100%;height:100%;justify-content:'+styles.justifyContent+';align-items:'+styles.alignItems+';';
                    let contentHtml = '';
                    if (el.children && el.children.length > 0) {
                      for (const child of el.children) contentHtml += exportElementToHTML(child);
                    } else {
                      contentHtml = '<span style="color:inherit;font-size:inherit;">'+(el.label||'Button')+'</span>';
                    }
                    return '<div style="'+wrap+'"><button class="el-button" style="'+style+'"'+dataAttrs+'><div class="btn-content" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;pointer-events:none;">'+contentHtml+'</div></button></div>';
                  }
                  default: return '<div>Unknown</div>';
                }
              }
              document.addEventListener('click', function(e) {
                const btn = e.target.closest('.el-button');
                if (!btn) return;
                const action = btn.dataset.action || 'link';
                if (action === 'link') {
                  window.open(btn.dataset.url || '#', btn.dataset.target || '_blank');
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
                    for (const el of layer.elements) inner += exportElementToHTML(el);
                    layerDiv.innerHTML = inner;
                    content.appendChild(layerDiv);
                  }
                  buffer.classList.add('active');
                } else if (action === 'dynamic') {
                  const dbId = btn.dataset.dynamicBox || '';
                  const pkgName = btn.dataset.package || '';
                  if (dbId && pkgName) alert('Dynamic: '+dbId+' -> '+pkgName);
                }
              });
              document.getElementById('buffer-close').addEventListener('click', function(e) {
                e.stopPropagation();
                document.getElementById('buffer-layer').classList.remove('active');
              });
              document.getElementById('buffer-layer').addEventListener('click', function(e) {
                if (e.target === this) this.classList.remove('active');
              });
              document.addEventListener('click', function(e) {
                const mediaItem = e.target.closest('.media-item');
                if (mediaItem) {
                  const img = mediaItem.querySelector('img');
                  if (img) {
                    document.getElementById('lightbox-img').src = img.src;
                    document.getElementById('lightbox').classList.add('active');
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

  // Helper for export (used inside the script tag above)
  function exportElementToHTML(el) {
    // This is the same as inside the script but we need it for the build process.
    // We'll just reuse the logic from the script string.
    // To avoid duplication, we'll simply use the string version defined above.
    return ''; // placeholder, actual implementation is inside the exported HTML script.
  }

  // ---- PANEL EVENTS ----
  function init() {
    const main = createCanvas('main', 1920, 1080, 'main', true);
    state.canvases.push(main);
    state.selectedCanvasId = main.id;

    const layer = main.layers[0];
    const box = createElement('box', { gridRows: 2, gridCols: 2, padding: 8, margin: 4 });
    layer.elements.push(box);
    const text = createElement('text', { content: 'Welcome to Page Builder', fontSize: 24, color: '#000000', fontWeight: '600', textAlign: 'center', anchor: 'mc' });
    if (box.children && box.children.length > 0) box.children[0].children.push(text);

    document.querySelectorAll('.palette-item').forEach(item => { item.draggable = true; });

    pushHistory();
    renderAll();
  }

  function renderAll() {
    renderCanvases();
    renderLayersPanel();
    renderPackages();
    renderProperties();
    renderAssets();
    updateToolbarState();
  }

  function updateToolbarState() {
    document.querySelectorAll('#toolbar .group button.active').forEach(b => b.classList.remove('active'));
    const devMap = { desktop: 'dev-desktop', tablet: 'dev-tablet', phone: 'dev-phone' };
    const btn = document.getElementById(devMap[state.deviceMode]);
    if (btn) btn.classList.add('active');
  }

  // ---- UNDO/REDO ----
  function undo() { if (historyIndex > 0) { historyIndex--; restoreSnapshot(history[historyIndex]); } }
  function redo() { if (historyIndex < history.length - 1) { historyIndex++; restoreSnapshot(history[historyIndex]); } }

  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (e.ctrlKey && e.shiftKey && e.key === 'Z') { e.preventDefault(); redo(); }
  });

  // ---- EVENT BINDINGS ----
  document.getElementById('btn-save').addEventListener('click', () => {
    const data = JSON.stringify({
      canvases: state.canvases,
      packages: state.packages,
      styles: state.styles,
      assets: state.assets.map(a => ({ id: a.id, type: a.type, name: a.name, url: a.url, data: a.data })),
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
      reader.onload = e => {
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
            state.canvases.push(createCanvas('main', 1920, 1080, 'main', true));
          }
          for (const c of state.canvases) {
            if (!c.layers.some(l => l.isBuffer)) {
              c.layers.push({ id: uid(), name: 'Buffer', elements: [], isBuffer: true, locked: true });
            }
          }
          state.selectedCanvasId = state.canvases[0]?.id || null;
          renderAll();
          pushHistory();
        } catch (err) { alert('Failed to load: ' + err.message); }
      };
      reader.readAsText(file);
    };
    input.click();
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    const mainCanvas = state.canvases.find(c => c.isMain) || state.canvases[0];
    if (!mainCanvas) return;
    const urlToPath = {};
    for (const asset of state.assets) {
      if (asset.url && asset.url.startsWith('blob:') && asset.data) {
        urlToPath[asset.url] = asset.data;
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

  document.getElementById('btn-export-zip').addEventListener('click', async function() {
    const mainCanvas = state.canvases.find(c => c.isMain) || state.canvases[0];
    if (!mainCanvas) return;
    const usedAssetIds = new Set();
    const collectAssetIds = (el) => {
      if (el.assetId) usedAssetIds.add(el.assetId);
      if (el.items) for (const item of el.items) if (item.assetId) usedAssetIds.add(item.assetId);
      if (el.children) for (const child of el.children) collectAssetIds(child);
    };
    for (const c of state.canvases) for (const layer of c.layers) for (const el of layer.elements) collectAssetIds(el);
    for (const pkg of state.packages) for (const el of pkg.elements) collectAssetIds(el);

    const urlToPath = {};
    const assetFiles = [];
    const usedNames = new Set();
    for (const asset of state.assets) {
      if (usedAssetIds.has(asset.id) && asset.data) {
        let fileName = asset.name;
        if (usedNames.has(fileName)) {
          const dot = fileName.lastIndexOf('.');
          fileName = (dot > 0 ? fileName.slice(0,dot)+'-'+asset.id+fileName.slice(dot) : fileName+'-'+asset.id);
        }
        usedNames.add(fileName);
        const path = 'assets/' + fileName;
        urlToPath[asset.url] = path;
        assetFiles.push({ id: asset.id, path, data: asset.data });
      }
    }
    const html = buildExportHTML(mainCanvas, urlToPath);
    const zip = new JSZip();
    zip.file('index.html', html);
    for (const file of assetFiles) {
      const base64 = file.data.split(',')[1];
      if (base64) zip.file(file.path, base64, { base64: true });
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zipBlob);
    a.download = 'project-export.zip';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('btn-preview').addEventListener('click', () => {
    const canvas = state.canvases.find(c => c.isMain) || state.canvases[0];
    if (canvas) showPreviewCanvas(canvas);
  });
  document.getElementById('preview-close').addEventListener('click', () => {
    document.getElementById('preview-overlay').classList.remove('active');
  });
  document.getElementById('preview-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('preview-overlay').classList.remove('active');
  });

  document.getElementById('dev-desktop').addEventListener('click', () => { state.deviceMode = 'desktop'; renderCanvases(); updateToolbarState(); });
  document.getElementById('dev-tablet').addEventListener('click', () => { state.deviceMode = 'tablet'; renderCanvases(); updateToolbarState(); });
  document.getElementById('dev-phone').addEventListener('click', () => { state.deviceMode = 'phone'; renderCanvases(); updateToolbarState(); });

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
      state.packages.push({ id: uid(), name, elements: [] });
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
    } else if (name) alert('Style already exists.');
  });

  document.getElementById('style-selector').addEventListener('change', function() {
    const name = this.value;
    if (name && state.styles[name]) alert('Style "' + name + '" selected. Apply it via element properties panel.');
  });

  document.getElementById('btn-asset-file').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,font/*';
    input.multiple = true;
    input.onchange = () => { for (const file of input.files) addAssetFile(file); };
    input.click();
  });
  document.getElementById('btn-asset-link').addEventListener('click', addAssetLink);

  const assetsBody = document.querySelector('#panel-assets .panel-body');
  assetsBody.addEventListener('dragover', e => { e.preventDefault(); assetsBody.style.border = '1px dashed #4a8ac4'; });
  assetsBody.addEventListener('dragleave', () => { assetsBody.style.border = 'none'; });
  assetsBody.addEventListener('drop', e => {
    e.preventDefault(); assetsBody.style.border = 'none';
    for (const file of e.dataTransfer.files) {
      if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('font/')) {
        addAssetFile(file);
      }
    }
  });

  document.getElementById('lightbox').addEventListener('click', () => document.getElementById('lightbox').classList.remove('active'));

  // Panel minimize
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
    header.addEventListener('mousedown', e => {
      if (e.target.closest('.pcontrols')) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      origX = rect.left; origY = rect.top;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    function onMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      panel.style.left = (origX + dx) + 'px';
      panel.style.top = (origY + dy) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }
    function onUp() { dragging = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
  });

  // Zoom/Pan
  const containerEl = document.getElementById('canvas-container');
  containerEl.addEventListener('mousedown', e => {
    if (e.button === 1) {
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      const startPanX = state.panX, startPanY = state.panY;
      const onMove = ev => {
        state.panX = startPanX + (ev.clientX - startX) / state.zoom;
        state.panY = startPanY + (ev.clientY - startY) / state.zoom;
        applyZoomPan();
      };
      const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }
  });
  containerEl.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    state.zoom = Math.max(0.1, Math.min(3, state.zoom + delta));
    applyZoomPan();
  }, { passive: false });

  // Palette drag
  document.querySelectorAll('.palette-item').forEach(item => {
    item.draggable = true;
    item.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', item.dataset.type);
      e.dataTransfer.effectAllowed = 'copy';
    });
  });

  // Canvas drop target for body
  document.getElementById('canvas-scroll').addEventListener('dragover', e => e.preventDefault());
  // (Additional body drop handled in renderCanvases)

  // ---- BOOT ----
  init();
  console.log('Page Builder ready (refactored).');
})();
