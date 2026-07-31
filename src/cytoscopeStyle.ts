import type {CytoscapeOptions} from 'cytoscape'

import {NODE_TYPE} from '../scripts/const.ts'

export const cytoscopeStyle = [{
    selector: `node[type="${NODE_TYPE.USER}"]`,
    style: {
        label: 'data(displayName)',
        'background-color': '#510',
    },
}, {
    selector: `node[type="${NODE_TYPE.ISSUE}"]`,
    style: {
        label: 'data(summary)',
        'background-color': '#f29',
    },
}, {
    selector: `node[type="${NODE_TYPE.SPRINT}"]`,
    style: {
        label: 'data(name)',
        'background-color': '#389',
    },
}, {
    selector: `node[type="${NODE_TYPE.COMPONENT}"]`,
    style: {
        label: 'data(name)',
        'background-color': '#32f',
    },
}, {
    selector: 'edge',
    style: {
        width: 'mapData(weight, 0, 1, 1, 10)',
        'line-color': '#888',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': '#888',
        'curve-style': 'bezier',
    },
}] as const satisfies CytoscapeOptions['style']
