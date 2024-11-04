<template>
    <div class="drawing-page">
      <h1>Drawing Tool</h1>
      <DrawingTool :width="800" :height="600" />
    </div>
  </template>
  
  <script setup lang="ts">
import DrawingTool from '@/components/drawing/DrawingTool.vue';

  // Component is auto-imported
  </script>
  
  <style scoped>
  .drawing-page {
    padding: 20px;
  }
  
  h1 {
    margin-bottom: 20px;
  }
  </style>