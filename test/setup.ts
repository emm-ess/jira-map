import {afterEach} from 'vitest'

import {destroyMaps} from './helpers/map.ts'

// A headless Cytoscape keeps timers alive: clean up whatever a test built.
afterEach(destroyMaps)
