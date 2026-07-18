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
