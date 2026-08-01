import type {CytoscapeOptions} from 'cytoscape'

import {EDGE_TYPE, NODE_TYPE} from '../scripts/const.ts'

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
        width: 1,
        'line-color': '#888',
        'curve-style': 'bezier',
    },
}, {
    selector: `edge[type="${EDGE_TYPE.MENTION_PER_USER}"], edge[type="${EDGE_TYPE.MENTION_PER_TICKET}"], edge[type="${EDGE_TYPE.MENTION_PER_COMMENT}"]`,
    style: {
        width: 'mapData(weight, 0, 1, 1, 10)',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': '#888',
    },
}] as const satisfies CytoscapeOptions['style']
