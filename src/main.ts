import './style.css'

import cytoscape from 'cytoscape'
import cola from 'cytoscape-cola'
import {createApp} from 'vue'

import App from './App.vue'

cytoscape.use(cola)

const app = createApp(App)
app.mount('#app')
