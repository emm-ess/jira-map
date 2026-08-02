import './style.css'

import cytoscape from 'cytoscape'
import cola from 'cytoscape-cola'
import dagre from 'cytoscape-dagre'
import elk from 'cytoscape-elk'
import euler from 'cytoscape-euler'
import fcose from 'cytoscape-fcose'
import svg from 'cytoscape-svg'
import {createApp} from 'vue'

import App from './App.vue'

cytoscape.use(cola)
cytoscape.use(dagre)
cytoscape.use(elk)
cytoscape.use(euler)
cytoscape.use(fcose)
cytoscape.use(svg)

const app = createApp(App)
app.mount('#app')
