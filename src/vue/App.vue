<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ITreeItem } from '../types';
import dialogVue from './dialog.vue';
const valid = ref(false)
const chapter = ref(null)
const dialogRef = ref<InstanceType<typeof dialogVue>>()
const linkLoaidng = ref(false)
const chapterLoaidng = ref(false)
const book = reactive<ITreeItem>({
  title: '',
  link: '',
  catalog: [],
})
function required (v: string) {
  return !!v || '请输入'
}
function toCss () {
  window.open('https://www.runoob.com/cssref/css-selectors.html', '_blank')
}
function openLink (type: number) {
  if (type === 1) {
    linkLoaidng.value = true
    setTimeout(() => {
      linkLoaidng.value = false
    }, 1000)
  }
  // dialogRef.value?.open()
}
function openText () {
  dialogRef.value?.open()
}
</script>

<template>
  <v-form class="form" v-model="valid">
    <v-text-field v-model="book.title" label="书籍名称" variant="underlined" :rules="[required]"></v-text-field>
    <v-text-field
      v-model="book.link"
      label="书籍链接"
      variant="underlined"
      :rules="[required]">
      <template v-slot:append>
        <v-btn :disabled="!book.link" :loading="linkLoaidng" variant="text" @click="openLink(1)">查看HTML</v-btn>
      </template>
    </v-text-field>
    <v-text-field v-model="book.catalogDom" label="目录节点" variant="underlined" :rules="[required]">
      <template v-slot:append-inner>
        <v-tooltip>
          <template v-slot:activator="{ props }">
            <v-icon @click="toCss" v-bind="props" icon="mdi-help-circle-outline"></v-icon>
          </template>
          使用css选择器选择目录节点，点击图标可查看规则
        </v-tooltip>
      </template>
      <template v-slot:append>
        <v-btn variant="text">查看结果</v-btn>
      </template>
    </v-text-field>
    <v-autocomplete
      v-model="chapter"
      label="章节地址"
      :items="book.catalog"
      item-text="title"
      item-value="link"
      variant="underlined"
      no-data-text="暂无数据">
      <template v-slot:append>
        <v-btn :disabled="!chapter" variant="text" @click="openLink(2)">查看HTML</v-btn>
      </template>
    </v-autocomplete>
    <v-text-field v-model="book.chapterDom" label="正文节点" variant="underlined" :rules="[required]">
      <template v-slot:append-inner>
        <v-tooltip>
          <template v-slot:activator="{ props }">
            <v-icon @click="toCss" v-bind="props" icon="mdi-help-circle-outline"></v-icon>
          </template>
          使用css选择器选择目录节点，点击图标可查看规则
        </v-tooltip>
      </template>
      <template v-slot:append>
        <v-btn variant="text">查看结果</v-btn>
      </template>
    </v-text-field>
  </v-form>
  <dialogVue ref="dialogRef"></dialogVue>
</template>

<style scoped>
.form {
  padding: 16px 24px;
}
</style>
