import { createApp } from 'vue'

import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';

import App from './App.vue'
// import './style.css'

cytoscape.use( cola )

const app = createApp(App)
app.mount('#app')
