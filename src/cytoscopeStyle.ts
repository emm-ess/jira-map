import type {CytoscapeOptions} from 'cytoscape'

import {EDGE_TYPE, NODE_TYPE} from '../scripts/const.ts'
import {AVAILABLE_LINES} from './data.ts'

const linesStyles = [
    {
        selector: 'edge[type="segment"]',
        style: {
            width: 8,
            'line-style': 'solid',
            // @see https://js.cytoscape.org/demos/edge-types/
            // 'curve-style': 'round-segments',
            'curve-style': 'round-taxi',

            // 'line-fill': 'linear-gradient',
            // 'line-outline-width': 2,
            // 'line-outline-color': '#ffffff',
        },
    },
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    ...AVAILABLE_LINES.flatMap<CytoscapeOptions['style'][]>((line) => [{
        selector: `edge[area="${line.name}"]`,
        style: {
            'line-color': line.colorNormal,
        },
    }, {
        selector: `edge[area="${line.name}"].unused`,
        style: {
            'line-color': line.colorUnused,
        },
    }]),
] as const satisfies CytoscapeOptions['style'][]

export const cytoscopeStyle = [{
    selector: 'node[type="station"]',
    style: {
        label: 'data(name)',
        'background-color': '#fff',
        'border-color': '#111',
        'border-width': 3,
    },
}, {
    selector: 'node[type="intersection"]',
    style: {
        shape: 'round-rectangle',
        'background-color': '#fff',
    },
}, {
    selector: 'edge[type="layout-helper-force"]',
    style: {
        display: 'none',
        // visibility: 'hidden',
    },
}, {
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
},
...linesStyles,
] as const satisfies CytoscapeOptions['style']
