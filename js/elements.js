// elements.js - Element creation and manipulation

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
