<template>
  <v-dialog class="dialog" v-model="dialog" fullscreen>
    <v-toolbar>
      <v-btn icon="mdi-close" @click="dialog = false"></v-btn>
      <v-toolbar-title>Settings</v-toolbar-title>
    </v-toolbar>
    <v-card></v-card>
  </v-dialog>
</template>
<script setup lang="ts">
import { ref } from 'vue';


const dialog = ref(false)

const open = () => {
  dialog.value = true
}

defineExpose({ open })
</script>
<style>
</style>