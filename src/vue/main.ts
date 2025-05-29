import { createApp } from 'vue'
import App from './App.vue'
// @ts-ignore
import 'vuetify/styles'
// @ts-ignore
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'

const vuetify = createVuetify()
createApp(App).use(vuetify).mount('#app')
