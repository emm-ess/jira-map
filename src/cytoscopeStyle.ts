import type {CytoscapeOptions} from 'cytoscape'

import {EDGE_TYPE, NODE_TYPE} from '../scripts/const.ts'
import {AVAILABLE_LINES} from './data.ts'

// gray active #727782
// gray unused #EDEEF0

const linesStyles = [
    {
        selector: 'edge[type="segment"]',
        style: {
            width: 8,
            'line-style': 'solid',
            // @see https://js.cytoscape.org/demos/edge-types/
            'curve-style': 'bezier',
            // 'curve-style': 'round-segments',
            // 'curve-style': 'round-taxi',
            // 'taxi-turn': '50%',
            'taxi-turn-min-distance': '16px',

            'edge-distances': 'node-position',
            'source-endpoint': 'inside-to-node',
            'target-endpoint': 'inside-to-node',

            // 'line-fill': 'linear-gradient',
            // 'line-outline-width': 2,
            // 'line-outline-color': '#ffffff',
        },
    }, {
        selector: 'edge[type="segment"][?future]',
        style: {
            'line-style': 'dashed',
        },
    },
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    ...AVAILABLE_LINES.flatMap<CytoscapeOptions['style'][]>((line) => [{
        selector: `edge[line="${line.name}"]`,
        style: {
            'line-color': line.colorNormal,
        },
    }, {
        selector: `edge[line="${line.name}"].unused`,
        style: {
            'line-color': line.colorUnused,
        },
    }, {
        selector: `node[type="station"][line="${line.name}"]`,
        style: {
            'outline-color': line.colorNormal,
        },
    }, {
        selector: `node[type="station"][line="${line.name}"].unused`,
        style: {
            'outline-color': line.colorUnused,
        },
    }]),
] as const satisfies CytoscapeOptions['style'][]

export const cytoscopeStyle = [{
    selector: 'node[type="station"]',
    style: {
        label: 'data(name)',
        width: 8,
        height: 8,
        'background-color': '#fff',
        // 'border-position': 'outside',
        'border-width': 0,
        'outline-width': 3,
    },
}, {
    selector: 'node[type="intersection"]',
    style: {
        shape: 'round-rectangle',
        padding: 0,
        'background-color': '#fff',
        'outline-width': 2,
        'outline-color': '#727782',
        'compound-sizing-wrt-labels': 'exclude',
    },
}, {
    selector: 'node[type="intersection"]:childless',
    style: {
        display: 'none',
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
